import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";

const isDebug = process.env.NODE_ENV !== "production";

const createCorsHeaders = (origin: string | null) => {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: createCorsHeaders(request.headers.get("Origin")),
    });
  }

  return Response.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: createCorsHeaders(request.headers.get("Origin")),
    },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const corsHeaders = createCorsHeaders(request.headers.get("Origin"));

  // 1. Recibir datos del pixel
  const { affiliateHandle, clientId, shopifyOrderId, totalAmount, shop } = await request.json();
  const amount = Number(totalAmount);

  if (isDebug) {
    console.log("[conversion] incoming", {
      affiliateHandle,
      clientId,
      shopifyOrderId,
      totalAmount,
      amount,
      shop,
    });
  }

  if (affiliateHandle && clientId && !shopifyOrderId) {
    await db.affiliateAttribution.upsert({
      where: { clientId },
      update: {
        affiliateHandle,
        shop: shop ?? null,
      },
      create: {
        clientId,
        affiliateHandle,
        shop: shop ?? null,
      },
    });

    if (isDebug) {
      console.log("[conversion] attribution stored", {
        clientId,
        affiliateHandle,
        shop,
      });
    }

    return Response.json({ success: true, tracked: true }, { headers: corsHeaders });
  }

  let resolvedAffiliateHandle = affiliateHandle;

  if (!resolvedAffiliateHandle && clientId) {
    const attribution = await db.affiliateAttribution.findUnique({
      where: { clientId },
    });

    resolvedAffiliateHandle = attribution?.affiliateHandle;
  }

  if (!shop || !resolvedAffiliateHandle || !shopifyOrderId || Number.isNaN(amount)) {
    if (isDebug) {
      console.warn("[conversion] invalid payload", {
        affiliateHandle,
        clientId,
        resolvedAffiliateHandle,
        shopifyOrderId,
        totalAmount,
        amount,
        shop,
      });
    }
    return Response.json({ error: "Payload invalido" }, { status: 400, headers: corsHeaders });
  }

  // 2. Obtener cliente Admin por tienda para facturar usage
  const { admin } = await unauthenticated.admin(shop);

  // 3. IDEMPOTENCIA: Verificar si ya procesamos esta orden
  const existingEvent = await db.referralEvent.findUnique({
    where: { shopifyOrderId },
  });

  if (existingEvent) {
    if (isDebug) {
      console.log("[conversion] duplicate ignored", { shopifyOrderId });
    }
    return Response.json({ message: "Orden ya procesada" }, { status: 200, headers: corsHeaders });
  }

  
  const affiliate = await db.affiliate.findUnique({
    where: { handle: resolvedAffiliateHandle },
  });

  if (!affiliate) {
    if (isDebug) {
      console.warn("[conversion] affiliate not found", { affiliateHandle: resolvedAffiliateHandle });
    }
    return Response.json({ error: "Afiliado no encontrado" }, { status: 404, headers: corsHeaders });
  }

 
  const appCommission = Number((amount * 0.05).toFixed(2));
  let billingStatus: "charged" | "pending" = "charged";
  let billingDetails: string | undefined;

  try {
    const subscriptionResponse = await admin.graphql(`
      query GetUsageLineItem {
        currentAppInstallation {
          activeSubscriptions {
            lineItems {
              id
              plan {
                pricingDetails {
                  __typename
                }
              }
            }
          }
        }
      }
    `);

    const subscriptionJson = (await subscriptionResponse.json()) as {
      data?: {
        currentAppInstallation?: {
          activeSubscriptions?: Array<{
            lineItems?: Array<{
              id: string;
              plan?: { pricingDetails?: { __typename?: string } };
            }>;
          }>;
        };
      };
    };

    const subscriptionLineItemId =
      subscriptionJson.data?.currentAppInstallation?.activeSubscriptions
        ?.flatMap((subscription) => subscription.lineItems ?? [])
        .find((lineItem) => lineItem.plan?.pricingDetails?.__typename === "AppUsagePricing")
        ?.id;

    if (!subscriptionLineItemId) {
      billingStatus = "pending";
      billingDetails = "missing-usage-line-item";
      if (isDebug) {
        console.warn("[conversion] missing usage line item", { shop, shopifyOrderId });
      }
    } else {
      const billingResponse = await admin.graphql(
        `
        mutation appUsageRecordCreate($description: String!, $price: MoneyInput!, $subscriptionLineItemId: ID!) {
          appUsageRecordCreate(
            description: $description,
            price: $price,
            subscriptionLineItemId: $subscriptionLineItemId
          ) {
            userErrors { field message }
          }
        }
        `,
        {
          variables: {
            description: `Comision infraestructura - Orden ${shopifyOrderId}`,
            price: { amount: appCommission, currencyCode: "USD" },
            subscriptionLineItemId,
          },
        },
      );

      const billingJson = (await billingResponse.json()) as {
        data?: {
          appUsageRecordCreate?: {
            userErrors?: Array<{ field?: string[]; message: string }>;
          };
        };
      };

      const userErrors = billingJson.data?.appUsageRecordCreate?.userErrors ?? [];
      if (userErrors.length > 0) {
        billingStatus = "pending";
        billingDetails = userErrors.map((error) => error.message).join("; ");
        if (isDebug) {
          console.warn("[conversion] billing userErrors", { userErrors, shopifyOrderId, amount });
        }
      }
    }
  } catch (error) {
    billingStatus = "pending";
    billingDetails = "billing-exception";
    console.error("[conversion] billing exception", { shopifyOrderId, amount, error });
  }

  await db.referralEvent.create({
    data: {
      shopifyOrderId,
      orderAmount: amount,
      appCommission,
      affiliateId: affiliate.id,
    },
  });

  if (isDebug) {
    console.log("[conversion] stored", {
      shopifyOrderId,
      amount,
      appCommission,
      affiliateId: affiliate.id,
      billingStatus,
      billingDetails,
    });
  }

  return Response.json(
    {
      success: true,
      fee: appCommission,
      billingStatus,
      billingDetails,
    },
    { headers: corsHeaders },
  );
};
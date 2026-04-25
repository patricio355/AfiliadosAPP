import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";

import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

const isDebug = process.env.NODE_ENV !== "production";

const syncWebPixelSettings = async (
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  appUrl: string,
  shopDomain?: string,
) => {
  const settings = {
    app_url: appUrl,
    accountID: "1",
    shop_domain: shopDomain ?? "",
  };

  let existingPixelId: string | undefined;

  try {
    const queryResponse = await admin.graphql(`
      query GetWebPixels {
        webPixels(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    `);

    const queryJson = (await queryResponse.json()) as {
      data?: {
        webPixels?: {
          edges?: Array<{ node?: { id?: string } }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    if (queryJson.errors?.length) {
      if (isDebug) {
        console.warn("No se pudo consultar webPixels; se intentara crear uno nuevo", {
          errors: queryJson.errors,
        });
      }
    } else {
      existingPixelId = queryJson.data?.webPixels?.edges?.[0]?.node?.id;
    }
  } catch (error) {
    if (isDebug) {
      console.warn("Error consultando webPixels; se intentara crear uno nuevo", error);
    }
  }

  if (existingPixelId) {
    const updateResponse = await admin.graphql(
      `
      mutation UpdateWebPixel($id: ID!, $webPixel: WebPixelInput!) {
        webPixelUpdate(id: $id, webPixel: $webPixel) {
          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          id: existingPixelId,
          webPixel: { settings },
        },
      },
    );

    const updateJson = (await updateResponse.json()) as {
      data?: {
        webPixelUpdate?: {
          userErrors?: Array<{ field?: string[]; message?: string }>;
        };
      };
    };

    const updateErrors = updateJson.data?.webPixelUpdate?.userErrors ?? [];
    if (updateErrors.length > 0) {
      if (isDebug) {
        console.warn("webPixelUpdate devolvio userErrors", updateErrors);
      }
    }
    return;
  }

  const createResponse = await admin.graphql(
    `
    mutation CreateWebPixel($webPixel: WebPixelInput!) {
      webPixelCreate(webPixel: $webPixel) {
        userErrors {
          field
          message
        }
      }
    }
    `,
    {
      variables: {
        webPixel: { settings },
      },
    },
  );

  const createJson = (await createResponse.json()) as {
    data?: {
      webPixelCreate?: {
        userErrors?: Array<{ field?: string[]; message?: string }>;
      };
    };
  };

  const createErrors = createJson.data?.webPixelCreate?.userErrors ?? [];
  if (createErrors.length > 0) {
    if (isDebug) {
      console.warn("webPixelCreate devolvio userErrors", createErrors);
    }
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await authenticate.admin(request);
  const { admin, billing } = auth;
  const shopDomain = (auth as { session?: { shop?: string } }).session?.shop;

  const appUrl = process.env.SHOPIFY_APP_URL;
  if (appUrl) {
    try {
      await syncWebPixelSettings(admin, appUrl, shopDomain);
    } catch (error) {
      console.error("No se pudo sincronizar la configuracion del web pixel:", error);
    }
  }

  try {
  
    await billing.require({
      plans: ["Plan de Comisiones"],
      onFailure: async () => {
        if (isDebug) {
          console.log("Iniciando solicitud de billing para: Plan de Comisiones");
        }
        return billing.request({
          plan: "Plan de Comisiones",
          isTest: process.env.NODE_ENV !== "production",
        });
      },
    });
  } catch (error) {
    console.error("Error en Billing:", error);
    throw error;
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <PolarisProvider i18n={enTranslations}>
      <AppProvider embedded apiKey={apiKey}>
        <NavMenu>
        
          <a href="/app" rel="home">Dashboard</a>

         
          <a href="/app/affiliates">Gestión de Afiliados</a>
        </NavMenu>
        <Outlet />
      </AppProvider>
    </PolarisProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
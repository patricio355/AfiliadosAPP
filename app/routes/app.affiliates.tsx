import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import {
  Page, Layout, Card, ResourceList, ResourceItem, Text, 
  TextField, Button, FormLayout, InlineStack, Badge
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// LOADER: Trae los afiliados de la BD (SQLite) 
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const affiliates = await db.affiliate.findMany({
    orderBy: { createdAt: "desc" },
  });
  return { affiliates };
};


export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const handle = formData.get("handle") as string;
  const percentage = parseFloat(formData.get("percentage") as string);

  try {
    const affiliate = await db.affiliate.create({
      data: { handle, commissionPercentage: percentage },
    });
    return { affiliate, error: null };
  } catch (e) {
    return { affiliate: null, error: "El identificador ya existe" };
  }
};

export default function AffiliatesPage() {
  const { affiliates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();

  const [handle, setHandle] = useState("");
  const [percentage, setPercentage] = useState("5");

  const isSaving = nav.state === "submitting";

  const onCreate = () => {
    submit({ handle, percentage }, { method: "POST" });
    setHandle("");
  };

  return (
    <Page title="Gestión de Afiliados">
      <Layout>
       
        <Layout.Section variant="oneThird">
          <Card>
            <FormLayout>
              <Text as="h2" variant="headingMd">Nuevo Afiliado</Text>
              <TextField
                label="Identificador Único (Handle)"
                value={handle}
                onChange={setHandle}
                helpText="Ej: TIENDASMART"
                autoComplete="off"
                error={actionData?.error ?? undefined}
              />
              <TextField
                label="Comisión para el Afiliado (%)"
                type="number"
                value={percentage}
                onChange={setPercentage}
                suffix="%"
                autoComplete="off"
              />
              <Button onClick={onCreate} loading={isSaving} variant="primary">
                Crear Afiliado
              </Button>
            </FormLayout>
          </Card>
        </Layout.Section>

      
        <Layout.Section>
          <Card padding="0">
            <ResourceList
              resourceName={{ singular: 'afiliado', plural: 'afiliados' }}
              items={affiliates}
              renderItem={(item) => (
                <ResourceItem id={item.id} onClick={() => {}}>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd" fontWeight="bold">{item.handle}</Text>
                    <Badge tone="info">{`${item.commissionPercentage}% comision`}</Badge>
                  </InlineStack>
                </ResourceItem>
              )}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
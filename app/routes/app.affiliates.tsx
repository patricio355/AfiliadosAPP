import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  TextField,
  Button,
  FormLayout,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type ActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

const getAffiliateInput = (formData: FormData) => {
  const handle = String(formData.get("handle") ?? "").trim();
  const percentageValue = Number(formData.get("percentage"));

  if (!handle) {
    throw new Error("Debes indicar un identificador para el afiliado");
  }

  if (!Number.isFinite(percentageValue)) {
    throw new Error("La comisión debe ser un número válido");
  }

  return {
    handle,
    commissionPercentage: percentageValue,
  };
};

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
  const intent = String(formData.get("intent") ?? "create");

  try {
    if (intent === "create") {
      const data = getAffiliateInput(formData);

      await db.affiliate.create({
        data,
      });

      return { ok: true, message: "Afiliado creado" } satisfies ActionResult;
    }

    if (intent === "update") {
      const id = String(formData.get("id") ?? "").trim();

      if (!id) {
        throw new Error("No se pudo identificar el afiliado a editar");
      }

      const data = getAffiliateInput(formData);

      await db.affiliate.update({
        where: { id },
        data,
      });

      return { ok: true, message: "Afiliado actualizado" } satisfies ActionResult;
    }

    if (intent === "delete") {
      const id = String(formData.get("id") ?? "").trim();

      if (!id) {
        throw new Error("No se pudo identificar el afiliado a eliminar");
      }

      await db.$transaction([
        db.referralEvent.deleteMany({ where: { affiliateId: id } }),
        db.affiliate.delete({ where: { id } }),
      ]);

      return { ok: true, message: "Afiliado eliminado" } satisfies ActionResult;
    }

    if (intent === "clear-all") {
      await db.$transaction([
        db.referralEvent.deleteMany({}),
        db.affiliate.deleteMany({}),
        db.session.deleteMany({}),
      ]);

      return { ok: true, message: "Base de datos vaciada" } satisfies ActionResult;
    }

    return { ok: false, error: "Acción no soportada" } satisfies ActionResult;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { ok: false, error: "El identificador ya existe" } satisfies ActionResult;
    }

    if (error instanceof Error) {
      return { ok: false, error: error.message } satisfies ActionResult;
    }

    return { ok: false, error: "No se pudo completar la acción" } satisfies ActionResult;
  }
};

export default function AffiliatesPage() {
  const { affiliates } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionResult>();
  const nav = useNavigation();
  const submit = useSubmit();

  const [handle, setHandle] = useState("");
  const [percentage, setPercentage] = useState("5");
  const [editingAffiliate, setEditingAffiliate] = useState<(typeof affiliates)[number] | null>(null);

  const isSaving = nav.state === "submitting";
  const isEditing = Boolean(editingAffiliate);

  useEffect(() => {
    if (editingAffiliate) {
      setHandle(editingAffiliate.handle);
      setPercentage(String(editingAffiliate.commissionPercentage));
      return;
    }

    setHandle("");
    setPercentage("5");
  }, [editingAffiliate]);

  useEffect(() => {
    if (actionData?.ok) {
      setEditingAffiliate(null);
      setHandle("");
      setPercentage("5");
    }
  }, [actionData]);

  const onSave = () => {
    submit(
      {
        intent: isEditing ? "update" : "create",
        id: editingAffiliate?.id ?? "",
        handle,
        percentage,
      },
      { method: "POST" },
    );
  };

  const onEdit = (affiliate: (typeof affiliates)[number]) => {
    setEditingAffiliate(affiliate);
  };

  const onDelete = (id: string) => {
    submit(
      {
        intent: "delete",
        id,
      },
      { method: "POST" },
    );
  };

  const onClearDatabase = () => {
    const confirmed = window.confirm(
      "Esto eliminará afiliados, conversiones y sesiones. ¿Quieres continuar?",
    );

    if (!confirmed) {
      return;
    }

    submit({ intent: "clear-all" }, { method: "POST" });
  };

  return (
    <Page title="Gestión de Afiliados">
      <Layout>
       
        <Layout.Section variant="oneThird">
          <Card>
            <FormLayout>
              <Text as="h2" variant="headingMd">
                {isEditing ? "Editar Afiliado" : "Nuevo Afiliado"}
              </Text>
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
              <InlineStack gap="300">
                <Button onClick={onSave} loading={isSaving} variant="primary">
                  {isEditing ? "Guardar Cambios" : "Crear Afiliado"}
                </Button>
                {isEditing ? (
                  <Button
                    onClick={() => setEditingAffiliate(null)}
                    disabled={isSaving}
                  >
                    Cancelar edición
                  </Button>
                ) : null}
              </InlineStack>
            </FormLayout>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <FormLayout>
              <Text as="h2" variant="headingMd">
                Mantenimiento
              </Text>
              <Text as="p" variant="bodyMd">
                Pruebas
              </Text>
              <Button tone="critical" onClick={onClearDatabase} loading={isSaving}>
                Vaciar BD
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
                <ResourceItem id={item.id} onClick={() => onEdit(item)}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodyMd" fontWeight="bold">
                        {item.handle}
                      </Text>
                      <Badge tone="info">{`${item.commissionPercentage}% comisión`}</Badge>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Button size="slim" onClick={() => onEdit(item)} disabled={isSaving}>
                        Editar
                      </Button>
                      <Button
                        size="slim"
                        tone="critical"
                        onClick={() => onDelete(item.id)}
                        disabled={isSaving}
                      >
                        Eliminar
                      </Button>
                    </InlineStack>
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
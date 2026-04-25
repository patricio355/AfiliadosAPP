import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  Grid,
  BlockStack,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // Obtenemos los totales agregados desde la tabla ReferralEvent 
  const stats = await db.referralEvent.aggregate({
    _sum: {
      orderAmount: true,    
      appCommission: true,   
    },
    _count: {
      id: true,
    }
  });

  const events = await db.referralEvent.findMany({
    include: { affiliate: true }
  });

  const totalAffiliateCommissions = events.reduce((acc: number, event: typeof events[0]) => {
    if (!event.affiliate) return acc;
    return acc + (Number(event.orderAmount || 0) * (event.affiliate.commissionPercentage / 100));
  }, 0);

  return {
    totalSales: stats._sum.orderAmount || 0,
    totalAppCommissions: stats._sum.appCommission || 0,
    totalAffiliateCommissions,
    totalOrders: stats._count.id,
  };
};

export default function DashboardPage() {
  const { totalSales, totalAppCommissions, totalAffiliateCommissions, totalOrders } = useLoaderData<typeof loader>();

  return (
    <Page title="Dashboard de Rendimiento">
      <Layout>
        <Layout.Section>
          <Grid>
       
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm">Ventas Referidas</Text>
                  <Text as="p" variant="headingLg" tone="success">
                    ${totalSales.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">{totalOrders} órdenes totales</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>

            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm">Comisiones para la App (5%)</Text>
                  <Text as="p" variant="headingLg" tone="success">
                    ${totalAppCommissions.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">Tarifa de servicio del sistema</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>

            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm">Comisiones a Afiliados</Text>
                  <Text as="p" variant="headingLg" tone="caution">
                    ${totalAffiliateCommissions.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">Pendiente de liquidación </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Análisis de Infraestructura</Text>
              <Box paddingBlockEnd="400">
                <Text as="p" variant="bodyMd">
                  Este Dashboard utiliza agregaciones directas en **SQLite** mediante **Prisma**, garantizando integridad de datos y rapidez en las consultas bajo carga inicial.
                </Text>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
import {register} from '@shopify/web-pixels-extension';

register(({analytics, browser, settings}) => {
  console.log('affiliate-tracker pixel loaded', {
    appUrl: settings.app_url,
  });

  const getShopDomain = (event: { context?: { document?: { location?: { hostname?: string } }; window?: { location?: { hostname?: string } } } }) => {
    return (
      settings.shop_domain ||
      event.context?.document?.location?.hostname ||
      event.context?.window?.location?.hostname ||
      ""
    );
  };

  const buildConversionUrl = () => {
    return new URL('/api/conversion', settings.app_url).toString();
  };
 
  analytics.subscribe('page_viewed', async (event) => {
    const url = new URL(event.context.document.location.href);
    const affiliateHandle = url.searchParams.get('ref');
    const clientId = event.clientId;
    const shopDomain = getShopDomain(event);

    console.log('affiliate-tracker page_viewed', {
      href: url.href,
      affiliateHandle,
      clientId,
    });
    
    if (affiliateHandle) {
      await browser.cookie.set(`affiliate_ref=${affiliateHandle}; path=/; max-age=2592000; SameSite=Lax`);
      await browser.localStorage.setItem('affiliate_ref', affiliateHandle);
      await browser.sessionStorage.setItem('affiliate_ref', affiliateHandle);
      await fetch(buildConversionUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          affiliateHandle,
          clientId,
          shop: shopDomain,
        }),
        keepalive: true,
      });
      console.log('Afiliado detectado:', affiliateHandle);
    } else {
      console.log('affiliate-tracker page_viewed sin ref');
    }
  });

  // REQUERIMIENTO 3.C: Tracking de Conversiones [cite: 18]
  analytics.subscribe('checkout_completed', async (event) => {
    const affiliateHandle =
      (await browser.cookie.get('affiliate_ref')) ||
      (await browser.localStorage.getItem('affiliate_ref')) ||
      (await browser.sessionStorage.getItem('affiliate_ref'));
    const clientId = event.clientId;
    const shopDomain = getShopDomain(event);
    const conversionUrl = buildConversionUrl();

    console.log('affiliate-tracker checkout_completed', {
      affiliateHandle,
      clientId,
      hasCheckout: Boolean(event.data.checkout),
      eventId: event.id,
    });
    
    
    if (affiliateHandle) {
      const checkout = event.data.checkout;
      if (!checkout.totalPrice) {
        console.log('affiliate-tracker checkout_completed sin totalPrice');
        return;
      }

      const shopifyOrderId = checkout.order?.id || event.id;
      if (!shopifyOrderId) {
        console.log('affiliate-tracker checkout_completed sin shopifyOrderId');
        return;
      }
      
      const payload = {
        affiliateHandle: affiliateHandle,
        clientId,
        shopifyOrderId,
        totalAmount: checkout.totalPrice.amount,
        shop: shopDomain,
      };

      console.log('affiliate-tracker sending conversion', payload);

      
      try {
        const response = await fetch(conversionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          keepalive: true,
        });

        if (!response.ok) {
          console.error('Fallo al enviar conversión:', response.status, await response.text());
        } else {
          console.log('affiliate-tracker conversion sent OK', response.status);
        }
      } catch (error) {
        console.error('Error enviando conversión:', error);
      }
    } else {
      console.log('affiliate-tracker checkout_completed sin affiliateHandle guardado');
    }
  });
});
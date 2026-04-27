Este repositorio contiene mi solución para la prueba técnica de Converxity. Más que un simple MVP que funciona localmente, he diseñado esta App pensando en los desafíos reales que enfrentamos al escalar en el ecosistema de Shopify: picos de tráfico masivos, integridad en los cobros y una experiencia de usuario fluida para el merchant.

Mi flujo de trabajo y gestión de entornos
En el desarrollo de aplicaciones para Shopify, la estabilidad lo es todo. Por eso, aunque esta prueba corre localmente, mi flujo profesional sigue una estructura de tres niveles:

Desarrollo: Uso Shopify CLI y SQLite por agilidad.

Staging: Aquí es donde realmente validamos que los webhooks y los cobros (Billing API) se comporten como esperamos antes de que un usuario real los toque.

Producción: El entorno final. Aquí priorizo el monitoreo constante y la seguridad de las variables de entorno.

Soy fiel al Trunk-based Development. Prefiero integraciones pequeñas y frecuentes que pasar días resolviendo conflictos de código. Si pasa las pruebas automatizadas, está listo para avanzar.

Despliegue y CI/CD 
Si lleváramos esta App a producción, configuraría un flujo de GitHub Actions que haga el "trabajo sucio" por nosotros: revisar que el código esté limpio (Linting), que los tests pasen y que no haya vulnerabilidades en las librerías.

Para el despliegue, mi opción preferida es Docker. Nos da la paz mental de saber que "en mi máquina funciona" también será "en la nube funciona". Lo ideal sería hostearlo en plataformas como Fly.io o AWS, manteniéndonos cerca de los servidores de Shopify para que la latencia sea mínima.

Base de Datos 

Actualmente usamos SQLite por simplicidad, pero para una App que aspira a estar en miles de tiendas, el plan de migración es claro:

Salto a PostgreSQL: Necesitamos robustez para manejar millones de eventos de tracking sin despeinarnos.

Estrategias de carga: En días de tráfico loco (como un Black Friday), implementaría réplicas de lectura. Así, mientras el sistema registra ventas sin parar, el merchant puede ver sus reportes en el dashboard sin que la App se ralentice.

Orden en los datos: Usaría particionamiento por fechas, manteniendo las consultas rápidas sin importar cuántos años de historial tengamos.


Seguridad y Robustez :


Sin cobros dobles (Idempotencia): El Web Pixel a veces puede ser caprichoso y disparar un evento dos veces. Mi lógica de backend verifica cada order_id antes de procesar una comisión. Si ya lo vimos, lo ignoramos. Así protegemos la billetera del merchant.

Respetando los límites: La API de Shopify tiene límites de velocidad (Rate Limits). He diseñado el sistema para que, si recibimos un aviso de "espera", la App sepa reintentar de forma inteligente (Exponential Backoff) mediante colas de procesamiento, evitando bloqueos.

Comunicación blindada: No confío en cualquier petición. Todas las comunicaciones con el backend se validan mediante firmas de seguridad (HMAC), asegurando que solo Shopify pueda hablar con nosotros.

Guía rápida para probarla

Descargar el repositorio.

Instala las dependencias: npm install

Prepara la base de datos: npx prisma migrate dev

Lánzala: npm run dev

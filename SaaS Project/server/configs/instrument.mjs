import * as Sentry from "@sentry/node"


Sentry.init({
  dsn: "https://82ede3d0bf402c78d19fc08bf06ebfac@o4511138469380096.ingest.us.sentry.io/4511138474360832",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});

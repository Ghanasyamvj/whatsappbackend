Replace dynamic placeholders in interactive messages with data loaded from Firestore

## Overview

For prototype flows, store message templates with placeholders like: "Hello {{patient.name}}, your doctor is {{doctor.name}} and your meds: {{patient.meds}}"

## Strategy

1. When you prepare a message to send, fetch the necessary documents from Firestore (patients, doctors, medications).
2. Use a small helper to replace placeholders in the template with actual values.

## Simple helper (Node.js)

```js
function renderTemplate(template, context) {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_, key) => {
    const parts = key.split(".");
    let val = context;
    for (const p of parts) {
      if (val == null) return "";
      val = val[p];
    }
    if (Array.isArray(val)) return val.join(", ");
    return String(val ?? "");
  });
}

// usage
const template =
  "Hello {{patient.name}}, your doctor is {{doctor.name}}. Meds: {{patient.meds}}";
const context = {
  patient: { name: "Alice", meds: ["Aspirin"] },
  doctor: { name: "Dr. Smith" },
};
console.log(renderTemplate(template, context));
```

## Where to call it

- In the send-flow handler, build `context` by fetching patient and doctor docs from Firestore using `patientService` and `doctorService` (or via admin.firestore directly).
- Render each message part (header/body/footer) before sending via the WhatsApp provider.

## Notes

- Keep context small to avoid extra reads; fetch only fields you need.
- For structured interactive messages (buttons, lists), you may need to render per-button text or row titles similarly.

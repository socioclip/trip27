"use client";
import type { Offer, PassengerInput } from "@/lib/types";
import { COUNTRIES } from "@/lib/countries";
import { todayYmd } from "@/lib/format";

export interface Contact {
  email: string;
  dial: string;
  phone: string;
}

const NAME = /^[A-Za-z][A-Za-z' -]{0,49}$/;

function age(bornOn: string, onDate: string) {
  const [by, bm, bd] = bornOn.split("-").map(Number);
  const [ty, tm, td] = onDate.split("-").map(Number);
  let a = ty - by;
  if (tm < bm || (tm === bm && td < bd)) a--;
  return a;
}

export function validatePassengers(offer: Offer, pax: PassengerInput[], contact: Contact): Record<string, string> {
  const e: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) e["contact.email"] = "Enter a valid email address";
  if (!/^\d{6,14}$/.test(contact.phone.replace(/\D/g, ""))) e["contact.phone"] = "Enter a valid mobile number";
  const lastDate = offer.slices[offer.slices.length - 1]?.departingAt.slice(0, 10) || todayYmd();
  pax.forEach((p, i) => {
    const k = (f: string) => `${i}.${f}`;
    if (!NAME.test(p.givenName.trim())) e[k("givenName")] = "Use English letters as in passport";
    if (!NAME.test(p.familyName.trim())) e[k("familyName")] = "Use English letters as in passport";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.bornOn)) e[k("bornOn")] = "Enter date of birth";
    else {
      const a = age(p.bornOn, lastDate);
      if (p.bornOn > todayYmd()) e[k("bornOn")] = "Date of birth can't be in the future";
      else if (p.type === "adult" && a < 12) e[k("bornOn")] = "Adults must be 12 or older";
      else if (p.type === "child" && (a < 2 || a > 11)) e[k("bornOn")] = "Children must be 2–11 years old during the trip";
      else if (p.type === "infant_without_seat" && a >= 2) e[k("bornOn")] = "Infants must be under 2 during the trip";
    }
    if (offer.requiresDocuments) {
      if (!/^[A-Za-z0-9]{5,20}$/.test(p.passportNumber || "")) e[k("passportNumber")] = "Enter passport number";
      if (!p.passportCountry) e[k("passportCountry")] = "Select issuing country";
      if (!p.passportExpiry || p.passportExpiry <= lastDate) e[k("passportExpiry")] = "Passport must be valid after your trip";
    }
  });
  return e;
}

export default function PassengerForms({
  offer,
  pax,
  setPax,
  contact,
  setContact,
  errors,
}: {
  offer: Offer;
  pax: PassengerInput[];
  setPax: (p: PassengerInput[]) => void;
  contact: Contact;
  setContact: (c: Contact) => void;
  errors: Record<string, string>;
}) {
  const update = (i: number, patch: Partial<PassengerInput>) => setPax(pax.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  let a = 0, c = 0, inf = 0;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-lg font-extrabold">Contact details</h2>
        <p className="text-sm text-muted mb-4">We&apos;ll send your booking confirmation here.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" error={errors["contact.email"]}>
            <input className="field" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="name@example.com" />
          </Field>
          <Field label="Mobile number" error={errors["contact.phone"]}>
            <div className="flex gap-2">
              <select className="field !w-[110px]" value={contact.dial} onChange={(e) => setContact({ ...contact, dial: e.target.value })} aria-label="Country code">
                {[...new Set(COUNTRIES.map((x) => x[2]))].sort((x, y) => Number(x) - Number(y)).map((d) => (
                  <option key={d} value={d}>+{d}</option>
                ))}
              </select>
              <input className="field" type="tel" inputMode="tel" autoComplete="tel-national" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="50 123 4567" />
            </div>
          </Field>
        </div>
      </div>

      {pax.map((p, i) => {
        const label = p.type === "adult" ? `Adult ${++a}` : p.type === "child" ? `Child ${++c}` : `Infant ${++inf}`;
        const err = (f: string) => errors[`${i}.${f}`];
        const titles = p.type === "adult" ? [["mr", "Mr"], ["ms", "Ms"], ["mrs", "Mrs"]] : [["mr", "Master"], ["miss", "Miss"]];
        return (
          <div key={p.id} className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold">{label}</h2>
              <span className="text-xs text-muted">{p.type === "adult" ? "12+ years" : p.type === "child" ? "2–11 years" : "Under 2, on lap"}</span>
            </div>
            <div className="rounded-xl bg-brand-50 text-brand-800 text-xs px-3 py-2 mb-4">Enter names exactly as they appear in the passport.</div>
            <div className="grid gap-4 sm:grid-cols-[150px_1fr_1fr]">
              <Field label="Title">
                <select className="field" value={p.title} onChange={(e) => {
                  const t = e.target.value as PassengerInput["title"];
                  update(i, { title: t, gender: t === "mr" ? "m" : "f" });
                }}>
                  {titles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="First & middle name" error={err("givenName")}>
                <input className="field" autoComplete={i === 0 ? "given-name" : "off"} value={p.givenName} onChange={(e) => update(i, { givenName: e.target.value })} />
              </Field>
              <Field label="Last name" error={err("familyName")}>
                <input className="field" autoComplete={i === 0 ? "family-name" : "off"} value={p.familyName} onChange={(e) => update(i, { familyName: e.target.value })} />
              </Field>
              <Field label="Gender">
                <select className="field" value={p.gender} onChange={(e) => update(i, { gender: e.target.value as "m" | "f" })}>
                  <option value="m">Male</option>
                  <option value="f">Female</option>
                </select>
              </Field>
              <Field label="Date of birth" error={err("bornOn")}>
                <input className="field" type="date" max={todayYmd()} value={p.bornOn} onChange={(e) => update(i, { bornOn: e.target.value })} />
              </Field>
            </div>
            {offer.requiresDocuments && (
              <div className="grid gap-4 sm:grid-cols-3 mt-4 pt-4 border-t border-line">
                <Field label="Passport number" error={err("passportNumber")}>
                  <input className="field uppercase" value={p.passportNumber || ""} onChange={(e) => update(i, { passportNumber: e.target.value.replace(/\s/g, "") })} />
                </Field>
                <Field label="Issuing country" error={err("passportCountry")}>
                  <select className="field" value={p.passportCountry || ""} onChange={(e) => update(i, { passportCountry: e.target.value })}>
                    <option value="">Select</option>
                    {[...COUNTRIES].sort((x, y) => x[1].localeCompare(y[1])).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </Field>
                <Field label="Passport expiry" error={err("passportExpiry")}>
                  <input className="field" type="date" min={todayYmd()} value={p.passportExpiry || ""} onChange={(e) => update(i, { passportExpiry: e.target.value })} />
                </Field>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error && <span role="alert" className="block text-xs font-medium text-accent-600 mt-1">{error}</span>}
    </label>
  );
}

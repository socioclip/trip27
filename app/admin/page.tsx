import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { adminSession } from "@/lib/admin";
import { getAdminState } from "@/lib/suppliers";
import SupplierAdmin from "@/components/admin/SupplierAdmin";

export const metadata: Metadata = { title: "Suppliers · Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { email, isAdmin } = await adminSession();
  if (!email) redirect("/login?next=/admin");
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-xl font-extrabold">No admin access</p>
        <p className="text-muted mt-2">
          You&apos;re signed in as <b className="text-ink">{email}</b>, which isn&apos;t on the admin list.
        </p>
        <Link href="/" className="btn-ghost mt-6">Back to trip27</Link>
      </div>
    );

  const state = await getAdminState();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-600">trip27 back office</p>
      <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">Flight suppliers</h1>
      <p className="text-muted mt-1 text-sm">Choose which suppliers answer searches on the site. Changes apply within seconds, with no redeploy.</p>
      <SupplierAdmin initial={state} email={email} />
    </div>
  );
}

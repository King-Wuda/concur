import { PasswordForm } from "@/components/PasswordForm";

export const metadata = { title: "Sign in - Budget" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
        <p className="text-sm text-ink-secondary">
          Snap a receipt, and watch the month add up.
        </p>
      </div>
      <PasswordForm next={next ?? "/"} />
    </div>
  );
}

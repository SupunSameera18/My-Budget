import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl text-ink-primary">
          Check your email
        </CardTitle>
        <CardDescription>Confirm your account to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-ink-secondary">
          We&apos;ve sent a confirmation link to your email address. Click it to
          activate your account, then sign in.
        </p>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Setup Required</CardTitle>
          <CardDescription>
            Add Supabase credentials to your environment and restart the dev server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create <code className="bg-muted px-1 rounded">.env.local</code> in the project root with:
          </p>
          <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
{`NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"

# Also needed for deployment:
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
ENCRYPTION_KEY="64-char-hex"
NEXT_PUBLIC_APP_URL="https://nostop.app"`}
          </pre>
          <p className="text-sm text-muted-foreground">
            Get these from your Supabase project → Settings → API. See <code className="bg-muted px-1 rounded">.env.example</code> for the full list.
          </p>
          <p className="text-sm">
            After saving, restart <code className="bg-muted px-1 rounded">npm run dev</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/PageLayout';

export default function Home() {
  return (
    <PageLayout title="Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
            <CardDescription>
              Import historical OHLC data or enter manually
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/data">Go to Data →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Strategies</CardTitle>
            <CardDescription>
              Create and manage trading strategies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/strategies">Go to Strategies →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signals</CardTitle>
            <CardDescription>
              View trading signal history from backtesting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/signals">Go to Signals →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Positions</CardTitle>
            <CardDescription>
              Monitor and manage open positions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/positions">Go to Positions →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

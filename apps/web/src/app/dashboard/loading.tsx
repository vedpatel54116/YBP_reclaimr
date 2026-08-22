import { Card, Skeleton } from "@reclaimr/ui";

/** Generic dashboard skeleton: header, KPI row, two panels. */
export default function DashboardLoading() {
  return (
    <div className="flex animate-fade-in flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="gap-3">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-3.5 w-40" />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Skeleton className="h-6 w-32" />
          <div className="mt-2 flex flex-col gap-4 border-t pt-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-start gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex w-full flex-col gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <Skeleton className="h-6 w-28" />
          <div className="mt-2 flex flex-col gap-2 border-t pt-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-md" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

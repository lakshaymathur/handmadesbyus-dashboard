import { Button } from "@/components/ui/button";

// Placeholder home until auth + the protected app layout land (M0 step 5).
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-4">
      <h1 className="font-heading text-2xl font-semibold">HandMadesByUs</h1>
      <p className="text-muted-foreground">
        Dashboard scaffold is running. Login and navigation come next.
      </p>
      <Button className="w-full sm:w-auto">Get started</Button>
    </main>
  );
}

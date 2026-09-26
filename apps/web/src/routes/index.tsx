import { createFileRoute } from "@tanstack/react-router";

import { EnsNameSearch } from "../components/ens-name-search";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return (
    <main className="hero-field relative isolate flex min-h-[calc(100dvh-4rem)] px-4">
      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center pt-52 text-center sm:pt-44">
        <h1 className="hero-title font-semibold">
          Trust the record.
          <span className="font-display text-midnight mt-2 block font-normal italic">
            Verify the source.
          </span>
        </h1>
        <div className="mt-10 w-full max-w-2xl">
          <EnsNameSearch />
        </div>
      </section>
    </main>
  );
}

import { Link } from "@tanstack/react-router";
import { ownerIdentity } from "../../../app/ext-client";

export function OwnerLanding() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ffffff_0,_#f4efe6_56%,_#ebe4d7_100%)] px-5 py-10 text-stone-900 sm:grid sm:place-items-center sm:p-8">
      <section className="mx-auto w-full max-w-xl rounded-[2rem] border border-stone-200 bg-[#fffdf9]/95 p-8 shadow-[0_28px_70px_rgba(66,54,36,0.14)] sm:p-12">
        <div className="flex items-center gap-3 text-[0.68rem] font-bold tracking-[0.18em] text-stone-500">
          <span className="grid size-7 place-items-center rounded-md bg-stone-900 text-xs tracking-normal text-white">{ownerIdentity.mark}</span>
        </div>
        <div className="mt-14">
          <h1 className="max-w-md text-4xl font-semibold tracking-[-0.045em] text-stone-950 sm:text-5xl">{ownerIdentity.name}</h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-stone-600">{ownerIdentity.description}</p>
        </div>
        <div className="mt-12 border-t border-stone-200 pt-7">
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            to="/signin"
          >
            Sign in to workspace
          </Link>
        </div>
        {ownerIdentity.showFooterCredit ? (
          <footer className="mt-12 text-xs text-stone-500">
            Powered by Slate · <a className="underline decoration-stone-300 underline-offset-4 hover:text-stone-900" href="https://runeditrun.com">runeditrun.com</a>
          </footer>
        ) : null}
      </section>
    </main>
  );
}

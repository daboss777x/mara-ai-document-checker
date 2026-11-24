"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Briefcase, House, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentSignIn } from "./login-form";
import { ClientSignIn } from "./client-form";

export type WelcomeStart = "intro" | "choose" | "agent" | "client";
type Phase = "high" | "rest" | "close" | "enter";
type Role = "client" | "agent";

/**
 * Welcome + sign-in (design/screens/welcome/Welcome-SignIn): the camera starts high in the sky,
 * pans down to the skyline, offers Client / Agent, then pushes in to the sign-in card.
 * Under prefers-reduced-motion every transition is instant (globals.css + the rules below).
 */
export function Welcome({
  start,
  demo,
  openLogin = false,
  next,
  notice,
}: {
  start: WelcomeStart;
  demo: boolean;
  /** Any details sign in as the shared demo agent (hosted demo on real Supabase). */
  openLogin?: boolean;
  next: string;
  /** Error/info shown on the agent card (e.g. expired magic link). */
  notice?: string;
}) {
  const [phase, setPhase] = useState<Phase>(start === "intro" ? "high" : start === "choose" ? "rest" : "close");
  const [role, setRole] = useState<Role | null>(start === "agent" || start === "client" ? start : null);
  const [first, setFirst] = useState(start === "intro");
  const [enterMsg, setEnterMsg] = useState("");

  useEffect(() => {
    if (phase !== "high") return;
    const t = setTimeout(() => setPhase("rest"), 600);
    return () => clearTimeout(t);
  }, [phase]);

  const pick = (r: Role) => {
    setRole(r);
    setFirst(false);
    setPhase("close");
  };
  const enter = (r: Role) => {
    setEnterMsg(r === "agent" ? "Mara is lining up the documents waiting for your review." : "Mara is getting your document checklist ready.");
    setPhase("enter");
  };

  const fade = (show: boolean, delay?: string) => cn("wl-fade", show ? "wl-show" : "wl-hide", show && delay);

  return (
    <div className="relative h-svh min-h-[680px] w-full overflow-hidden bg-[#1a5cc6] text-white">
      <style>{WELCOME_CSS}</style>

      <div className={cn("wl-world", `wl-${phase}`)} aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#0b46aa_0%,#1252bd_30%,#1a5cc6_58%,#2368cf_70%,#3477d6_77%,#6f98dc_82%,#9facdd_86%,#9facdd_100%)]" />
        <div className="wl-cloud" style={{ left: "6%", top: "34vh", width: 560, height: 120 }} />
        <div className="wl-cloud" style={{ right: "4%", top: "62vh", width: 700, height: 150, animationDelay: "-12s" }} />
        <div className="wl-cloud" style={{ left: "26%", top: "96vh", width: 820, height: 170, animationDelay: "-20s" }} />
        <div className="wl-cloud" style={{ right: "16%", top: "128vh", width: 460, height: 100, background: "rgba(255,226,210,.45)" }} />
        <div className="wl-cloud" style={{ left: "10%", top: "150vh", width: 380, height: 80, background: "rgba(255,255,255,.35)" }} />
        <div className="wl-photo" />
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="wl-glow" style={{ left: "-14%", top: "4%", width: "60vw", height: "60vw", background: "radial-gradient(circle, rgba(255,255,255,.28) 0%, rgba(255,255,255,0) 62%)" }} />
        <div className="wl-glow" style={{ right: "-14%", top: "36%", width: "50vw", height: "50vw", background: "radial-gradient(circle, rgba(255,205,180,.30) 0%, rgba(255,205,180,0) 62%)", animationDelay: "-6s" }} />
        <div className="absolute inset-0 bg-[url(/theme/grain.svg)] opacity-10 mix-blend-overlay" />
      </div>

      {/* Top nav */}
      <div className={cn(fade(phase !== "high", first ? "wl-late" : undefined), "absolute inset-x-0 top-5 z-20 flex justify-center px-4")}>
        <nav aria-label="Portal" className="cs-glass flex h-16 w-full max-w-[1120px] items-center justify-between gap-4 rounded-full pr-3 pl-6">
          <span className="flex items-baseline gap-2.5">
            <span className="font-display text-[26px] text-cs-ink">Cedar &amp; Stone</span>
            <span className="text-[11px] tracking-[3px] text-cs-ink-2 uppercase max-sm:hidden">Realty</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-2 px-3 text-[13px] text-cs-ink-2 max-md:hidden">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Secure portal
            </span>
            <a
              href="mailto:help@cedarstone.example"
              className="inline-flex h-11 items-center rounded-full bg-cs-ink px-5 text-sm font-medium text-white no-underline hover:bg-[#13296a]"
            >
              Need help?
            </a>
          </span>
        </nav>
      </div>

      {/* Hero: choose a door */}
      <section
        aria-label="Choose how you are signing in"
        aria-hidden={phase !== "rest" || undefined}
        inert={phase !== "rest"}
        className={cn(fade(phase === "rest", first ? "wl-late" : undefined), "absolute inset-x-0 top-[16vh] z-10 flex flex-col items-center px-6 text-center max-sm:top-[14vh]")}
      >
        <span className="cs-glass inline-flex h-[34px] items-center gap-2.5 rounded-full px-4 text-[13px] font-medium">
          <span className="size-[7px] rounded-full bg-cs-brand shadow-[0_0_10px_#1951fc]" />
          Client &amp; agent portal
        </span>
        <h1 className="wl-skytext mt-[22px] font-display text-[clamp(38px,5.4vw,80px)] leading-[0.98]">
          Every document, every date,
          <br />
          handled.
        </h1>
        <p className="wl-skytext mt-5 max-w-[520px] text-[19px] leading-normal font-medium max-sm:text-[17px]">
          Welcome to Cedar &amp; Stone. Tell us who you are and we&apos;ll take you to the right door.
        </p>
        <div className="mt-[38px] flex items-center gap-[18px] max-[900px]:w-full max-[900px]:max-w-[340px] max-[900px]:flex-col max-[900px]:items-stretch">
          <RoleButton icon={<House />} title="Client" sub="Buying or selling a home" onClick={() => pick("client")} />
          <RoleButton icon={<Briefcase />} title="Agent" sub="Cedar & Stone team" onClick={() => pick("agent")} />
        </div>
      </section>

      {/* Sign-in card */}
      <section
        aria-label="Sign in"
        aria-hidden={phase !== "close" || undefined}
        inert={phase !== "close"}
        className={cn(fade(phase === "close", "wl-late2"), "absolute inset-0 z-10 flex items-center justify-center gap-[72px] overflow-y-auto px-5 pt-[104px] pb-8")}
      >
        <Folder />
        <div className="cs-glass w-full max-w-[440px] rounded-[30px] bg-[linear-gradient(160deg,rgba(255,255,255,.86),rgba(255,255,255,.66))] px-[34px] pt-[34px] pb-7 text-cs-ink max-sm:px-6">
          <button
            type="button"
            onClick={() => setPhase("rest")}
            className="-mt-1.5 -ml-2.5 inline-flex h-11 items-center gap-2 rounded-full pr-3.5 pl-2.5 text-sm text-cs-ink-2 hover:bg-cs-ink/6"
          >
            <ArrowLeft className="size-[18px]" aria-hidden="true" />
            Back
          </button>
          {role === "agent" ? <AgentSignIn next={next} demo={demo || openLogin} notice={notice} onEnter={() => enter("agent")} onError={() => setPhase("close")} /> : null}
          {role === "client" ? <ClientSignIn demo={demo} onEnter={() => enter("client")} /> : null}
        </div>
      </section>

      {/* Entering */}
      <section
        aria-live="polite"
        aria-hidden={phase !== "enter" || undefined}
        className={cn(
          fade(phase === "enter", "wl-late3"),
          "absolute inset-0 z-30 flex flex-col items-center justify-center gap-[18px] bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,.35),rgba(26,92,198,.55))] p-6 text-center",
        )}
      >
        {phase === "enter" ? (
          <>
            <div className="wl-spin size-[54px] rounded-full border-[3px] border-white/40 border-t-white" aria-hidden="true" />
            <h2 className="wl-skytext font-display text-[clamp(36px,4vw,56px)] leading-none">Opening your portal…</h2>
            <p className="wl-skytext max-w-[420px] text-[17px] leading-normal font-medium">{enterMsg}</p>
          </>
        ) : null}
      </section>
    </div>
  );
}

function RoleButton({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cs-glass wl-role flex min-h-24 w-[290px] items-center gap-4 rounded-3xl px-[22px] py-[18px] text-left max-[900px]:w-full"
    >
      <span className="flex size-[52px] flex-none items-center justify-center rounded-full bg-cs-ink text-white [&_svg]:size-6" aria-hidden="true">
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-[30px] leading-none text-cs-ink">{title}</span>
        <span className="text-sm text-cs-ink-2">{sub}</span>
      </span>
    </button>
  );
}

function Folder() {
  return (
    <div className="wl-float relative h-[320px] w-[340px] flex-none max-[900px]:hidden" aria-hidden="true">
      <div className="absolute top-16 left-0 h-11 w-[150px] rounded-t-[20px] border border-b-0 border-white/70 bg-white/35" />
      <div className="absolute top-24 left-0 h-[224px] w-[340px] rounded-tr-[26px] rounded-b-[26px] border border-white/70 bg-white/30" />
      <div className="absolute top-[30px] left-14 flex h-[220px] w-[190px] flex-col gap-3 rounded-2xl bg-white px-[22px] py-[26px] shadow-[0_10px_30px_rgba(10,40,110,.22)]">
        <div className="h-2.5 w-[70%] rounded-md bg-[#b9cdf0]" />
        <div className="h-2 w-full rounded-md bg-[#dbe6f7]" />
        <div className="h-2 w-[86%] rounded-md bg-[#dbe6f7]" />
      </div>
      <div className="absolute top-11 left-[122px] flex h-[210px] w-[180px] rotate-6 flex-col gap-3 rounded-2xl bg-[#f6f9ff] px-[22px] py-[26px] shadow-[0_10px_30px_rgba(10,40,110,.22)]">
        <div className="h-2.5 w-[60%] rounded-md bg-[#b9cdf0]" />
        <div className="h-2 w-full rounded-md bg-[#dbe6f7]" />
      </div>
      <div className="cs-glass absolute bottom-0 left-0 flex h-[196px] w-[340px] flex-col justify-end rounded-[26px] px-7 py-[26px]">
        <span className="text-[15px] text-cs-ink-2">#your-deal-file</span>
        <span className="bg-[linear-gradient(180deg,#1951fc_0%,#0b2cb1_100%)] bg-clip-text text-[60px] leading-[0.95] font-semibold tracking-[-2.5px] text-transparent">
          documents
        </span>
      </div>
    </div>
  );
}

const WELCOME_CSS = `
.wl-world{position:absolute;left:0;right:0;top:0;height:260vh;transform-origin:50% 100%;transition:transform 3.4s cubic-bezier(.7,0,.18,1);will-change:transform}
.wl-high{transform:translateY(0) scale(1)}
.wl-rest{transform:translateY(-160vh) scale(1)}
.wl-close{transform:translateY(-160vh) scale(1.1);transition-duration:2.6s}
.wl-enter{transform:translateY(-160vh) scale(1.3);transition-duration:1.8s}
.wl-photo{position:absolute;left:0;right:0;bottom:0;height:min(52vh,calc(100vw * 610 / 1672));min-height:300px;background:url(/theme/austin-skyline.jpg) center bottom/cover no-repeat;-webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 32%);mask-image:linear-gradient(to bottom,transparent 0%,#000 32%)}
.wl-fade{transition:opacity .9s ease,transform .9s ease}
.wl-show{opacity:1;transform:none;pointer-events:auto}
.wl-hide{opacity:0;transform:translateY(18px);pointer-events:none}
.wl-late{transition-delay:2.5s}
.wl-late2{transition-delay:1.3s}
.wl-late3{transition-delay:.9s}
.wl-role{transition:transform .35s ease,box-shadow .35s ease}
.wl-role:hover{transform:translateY(-4px);box-shadow:inset 0 1px 0 #fff,0 0 40px rgba(255,255,255,.55),0 24px 60px rgba(10,40,110,.25)}
.wl-skytext{text-shadow:0 2px 24px rgba(8,40,120,.35)}
.wl-glow{position:absolute;border-radius:50%;filter:blur(60px);animation:wl-drift 20s ease-in-out infinite alternate}
.wl-cloud{position:absolute;border-radius:50%;background:rgba(255,255,255,.55);filter:blur(28px);animation:wl-cloud 40s linear infinite alternate}
.wl-float{animation:wl-float 7s ease-in-out infinite}
.wl-spin{animation:wl-spin 1.1s linear infinite}
@keyframes wl-drift{from{transform:translate(0,0) scale(1)}to{transform:translate(50px,-40px) scale(1.08)}}
@keyframes wl-cloud{from{transform:translateX(-30px)}to{transform:translateX(30px)}}
@keyframes wl-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes wl-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.wl-world,.wl-fade{transition-duration:.01s!important;transition-delay:0s!important}.wl-glow,.wl-float,.wl-cloud,.wl-spin{animation:none!important}}
`;

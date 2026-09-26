import { useEffect, useRef } from "react";

import { createFileRoute } from "@tanstack/react-router";

import { DiscordIcon, HugeiconsIcon, Mail01Icon, TelegramIcon } from "@thenamespace/uikit/icons";

import { EnsNameSearch } from "../components/ens-name-search";

import "../home.css";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const motion = window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    const labels = [...hero.querySelectorAll<HTMLElement>(".home-service")];
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      for (const label of labels) label.style.translate = "0px 0px";
    };
    const move = (event: PointerEvent) => {
      if (!motion.matches || event.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const offsets = labels.map((label) => {
          const rect = label.getBoundingClientRect();
          const dx = event.clientX - (rect.left + rect.width / 2);
          const dy = event.clientY - (rect.top + rect.height / 2);
          const pull = Math.max(0, 1 - Math.hypot(dx, dy) / 240) * 0.18;
          return `${dx * pull}px ${dy * pull}px`;
        });
        labels.forEach((label, index) => {
          label.style.translate = offsets[index] ?? "0px 0px";
        });
      });
    };
    hero.addEventListener("pointermove", move);
    hero.addEventListener("pointerleave", reset);
    motion.addEventListener("change", reset);
    return () => {
      reset();
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", reset);
      motion.removeEventListener("change", reset);
    };
  }, []);
  return (
    <main className="home-page">
      <section ref={heroRef} className="home-hero" aria-labelledby="home-title">
        <img
          className="home-art"
          src="/home-mosaic-hd.png"
          alt=""
          width="1672"
          height="941"
          fetchPriority="high"
        />
        <div className="home-content">
          <h1 id="home-title" className="home-title">
            ENS Verification
          </h1>
          <p className="home-statement font-display">Verify the source.</p>
          <p className="home-description">
            Your social accounts and email.
            <br />
            Verifiable connections to your ENS name.
          </p>
          <div className="home-search">
            <EnsNameSearch />
          </div>
        </div>
        <ul className="home-services" aria-label="Supported accounts">
          <li className="home-service home-service-github">
            <img src="/brands/github.svg" alt="" width="28" height="28" />
            GitHub
          </li>
          <li className="home-service home-service-email">
            <HugeiconsIcon icon={Mail01Icon} size={28} />
            Email
          </li>
          <li className="home-service home-service-farcaster">
            <img src="/brands/farcaster.svg" alt="" width="28" height="28" />
            Farcaster
          </li>
          <li className="home-service home-service-discord">
            <HugeiconsIcon icon={DiscordIcon} size={28} />
            Discord
          </li>
          <li className="home-service home-service-x">
            <img src="/brands/x.svg" alt="" width="28" height="28" />X
          </li>
          <li className="home-service home-service-telegram">
            <HugeiconsIcon icon={TelegramIcon} size={28} />
            Telegram
          </li>
        </ul>
      </section>
    </main>
  );
}

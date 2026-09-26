import { createFileRoute } from "@tanstack/react-router";

import { DiscordIcon, HugeiconsIcon, Mail01Icon, TelegramIcon } from "@thenamespace/uikit/icons";

import { EnsNameSearch } from "../components/ens-name-search";

import "../home.css";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <img
          className="home-art"
          src="/home-mosaic.webp"
          alt=""
          width="1536"
          height="1024"
          fetchPriority="high"
        />
        <div className="home-content">
          <p className="home-eyebrow">YOUR IDENTITY, CONNECTED</p>
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
          <p className="home-network">
            Built on ENSv2 <span aria-hidden="true">/</span> Sepolia testnet
          </p>
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
      <footer className="home-footer">
        <p>Your name. Your connections.</p>
        <a href="https://github.com/envoy1084/ens-social-verification">
          View source <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}

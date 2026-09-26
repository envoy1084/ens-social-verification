import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { useNavigate } from "@tanstack/react-router";

import { useSearchNames } from "@ensforge/react";
import { FieldError } from "@thenamespace/uikit/field-error";
import { SearchField } from "@thenamespace/uikit/search-field";
import { Spinner } from "@thenamespace/uikit/spinner";

import { normalizeEnsInput } from "../data/ens-name";
import { NameAvatar } from "./name-avatar";

export function EnsNameSearch({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);
  const search = useSearchNames({
    query: query.toLowerCase(),
    enabled: query.length >= 2,
    field: "name",
    mode: "starts-with",
    pageSize: 6,
    order: { field: "name", direction: "asc" },
    atom: { swr: { staleTime: "1 minute" } },
  });
  let exactName: string | undefined;
  try {
    if (input.trim()) exactName = normalizeEnsInput(input);
  } catch {
    /* Invalid input is reported on submit. */
  }
  const suggestions = new Set<string>();
  if (exactName) suggestions.add(exactName);
  if (query === input.trim())
    for (const domain of search.data?.items ?? []) {
      try {
        if (domain.name.kind === "normalized")
          suggestions.add(normalizeEnsInput(domain.name.value));
      } catch {
        /* Ignore invalid index entries. */
      }
    }
  const names = [...suggestions].slice(0, 6);
  const openName = useCallback(
    (value: string) => {
      try {
        const name = normalizeEnsInput(value);
        setInvalid(false);
        setOpen(false);
        void navigate({ to: "/$name", params: { name } });
      } catch {
        setInvalid(true);
      }
    },
    [navigate],
  );
  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }, []);
  const handleChange = useCallback((value: string) => {
    setInput(value);
    setInvalid(false);
    setOpen(value.trim().length >= 2);
  }, []);
  const handleFocus = useCallback(() => setOpen(input.trim().length >= 2), [input]);
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") setOpen(false);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      container.current?.querySelector<HTMLButtonElement>("[data-suggestion]")?.focus();
    }
  }, []);
  const selectSuggestion = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      openName(event.currentTarget.value);
    },
    [openName],
  );
  const moveSuggestion = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    const buttons = Array.from(
      container.current?.querySelectorAll<HTMLButtonElement>("[data-suggestion]") ?? [],
    );
    const index = buttons.indexOf(event.currentTarget);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) container.current?.querySelector("input")?.focus();
      else buttons[index - 1]?.focus();
    }
    if (event.key === "Escape") {
      setOpen(false);
      container.current?.querySelector("input")?.focus();
    }
  }, []);

  return (
    <div ref={container} className="relative w-full" onBlur={handleBlur}>
      <SearchField
        aria-label="Search ENS names"
        isInvalid={invalid}
        onChange={handleChange}
        onSubmit={openName}
        value={input}
      >
        <SearchField.Group
          className={
            compact ? "h-12 bg-white" : "h-16 bg-white shadow-[0_12px_40px_rgb(1_26_37/0.12)]"
          }
        >
          <SearchField.SearchIcon className="text-accent size-6" />
          <SearchField.Input
            className={compact ? "min-w-0 flex-1 text-sm" : "min-w-0 flex-1 text-base sm:text-lg"}
            placeholder="Search an ENS name"
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
          />
          <span className="mr-3 flex size-5 shrink-0 items-center justify-center">
            {search.isWaiting ? <Spinner size="sm" /> : null}
          </span>
        </SearchField.Group>
        <FieldError>Enter a valid ENS name.</FieldError>
      </SearchField>
      {open && names.length > 0 ? (
        <div
          aria-label="ENS name results"
          className="border-border bg-surface absolute top-[calc(100%+0.625rem)] z-20 max-h-80 w-full overflow-y-auto rounded-lg border p-2 text-left shadow-[0_20px_60px_rgb(1_26_37/0.16)]"
        >
          {names.map((name) => (
            <button
              data-suggestion
              key={name}
              aria-label={name}
              value={name}
              className="hover:bg-default focus-visible:bg-default flex min-h-14 w-full items-center gap-3 rounded-sm px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent"
              onClick={selectSuggestion}
              onKeyDown={moveSuggestion}
            >
              <NameAvatar
                name={name}
                src={`https://metadata.ens.domains/sepolia/avatar/${encodeURIComponent(name)}`}
              />
              <span className="min-w-0 truncate font-semibold">{name}</span>
            </button>
          ))}
          {search.isFailure ? (
            <output className="text-muted block px-3 py-2 text-sm">Suggestions unavailable</output>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

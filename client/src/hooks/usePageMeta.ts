import { useEffect, useRef } from "react";

type JsonLdObject = Record<string, unknown>;

type PageMetaInput = {
  title: string;
  description: string;
  jsonLd?: JsonLdObject | JsonLdObject[];
};

const DEFAULT_TITLE = "Sakan 4U | سكن طلابي موثّق في بني سويف";
const DEFAULT_DESCRIPTION = "Sakan 4U — منصة سكن طلابي موثّق في بني سويف.";
const SCRIPT_ID = "sakan-page-jsonld";

function ensureMetaDescription(): HTMLMetaElement {
  let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "description";
    document.head.appendChild(tag);
  }
  return tag;
}

function setJsonLd(data: JsonLdObject | JsonLdObject[] | undefined) {
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) existing.remove();
  if (!data) return;
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = SCRIPT_ID;
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

export function usePageMeta(input: PageMetaInput) {
  const titleRef = useRef(input.title);
  const descRef = useRef(input.description);
  const jsonLdRef = useRef(input.jsonLd);

  useEffect(() => {
    document.title = input.title;
    ensureMetaDescription().content = input.description;
    setJsonLd(input.jsonLd);

    return () => {
      document.title = DEFAULT_TITLE;
      ensureMetaDescription().content = DEFAULT_DESCRIPTION;
      const script = document.getElementById(SCRIPT_ID);
      if (script) script.remove();
    };
  }, [input.title, input.description, input.jsonLd]);

  titleRef.current = input.title;
  descRef.current = input.description;
  jsonLdRef.current = input.jsonLd;
}

import { createId } from "@/lib/workout/math";
import { importWorkoutText } from "./formats/detect";
import { MAX_IMPORT_CHARS, type ImportResult, type XmlElement, type XmlParser } from "./formats/types";

// Browser side of the importer: reads the File and supplies the platform
// services (DOMParser, ids, clock) the pure parsers in ./formats take as input.

const MAX_XML_ELEMENTS = 20_000;
const MAX_XML_DEPTH = 32;

// Chrome wraps the message in page boilerplate and Firefox appends the
// source line; keep only the sentence that says what and where.
function parserErrorMessage(parserError: Element): string {
  const text = parserError.querySelector("div")?.textContent ?? parserError.textContent ?? "";
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const message = lines.find((line) => /line \d+/i.test(line)) ?? lines[0] ?? "malformed XML";
  return message.length > 200 ? `${message.slice(0, 199)}…` : message;
}

// Browsers' DOMParser never fetches external entities; the .zwo reader also
// refuses any DOCTYPE before it gets here.
export const domXmlParser: XmlParser = (text) => {
  if (typeof DOMParser === "undefined") {
    return { ok: false, error: "XML parsing is not available here." };
  }
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    return { ok: false, error: parserErrorMessage(parserError) };
  }

  let count = 0;
  const convert = (element: Element, depth: number): XmlElement => {
    count += 1;
    if (count > MAX_XML_ELEMENTS || depth > MAX_XML_DEPTH) {
      throw new Error("too many or too deeply nested elements");
    }
    const attributes: Record<string, string> = {};
    for (const attribute of Array.from(element.attributes)) {
      attributes[attribute.name] = attribute.value;
    }
    let text = "";
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3 || node.nodeType === 4) text += node.nodeValue ?? "";
    }
    return {
      name: element.localName || element.nodeName,
      attributes,
      text,
      children: Array.from(element.children).map((child) => convert(child, depth + 1)),
    };
  };

  try {
    return { ok: true, root: convert(doc.documentElement, 0) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unreadable XML." };
  }
};

export async function readWorkoutFile(file: File, fallbackFtp: number): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_CHARS) {
    return { ok: false, error: "The file is too large to be a workout (limit 1 MB)." };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "The file could not be read." };
  }
  return importWorkoutText(text, {
    fileName: file.name,
    fallbackFtp,
    workoutId: createId("workout"),
    now: new Date().toISOString(),
    parseXml: domXmlParser,
  });
}

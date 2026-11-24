import { describe, expect, it } from "vitest";
import { bytesLabel, chipTone, dayLabel, isDemoUploadUrl, toUploadInput, uploadedLabel, validateUpload } from "./format";

describe("client format helpers", () => {
  it("formats dates without a timezone shift", () => {
    expect(dayLabel("2026-11-26")).toBe("Thu, Nov 26");
  });

  it("labels uploads as today or by date in Austin time", () => {
    const now = new Date("2026-11-24T18:00:00Z");
    expect(uploadedLabel("2026-11-24T15:41:00Z", now)).toBe("today, 9:41 AM");
    expect(uploadedLabel("2026-11-21T22:10:00Z", now)).toBe("Nov 21, 4:10 PM");
  });

  it("formats byte sizes", () => {
    expect(bytesLabel(900)).toBe("900 B");
    expect(bytesLabel(412_000)).toBe("402 KB");
    expect(bytesLabel(2_200_000)).toBe("2.1 MB");
  });

  it("maps tones to kit chip tones", () => {
    expect(chipTone("ok")).toBe("done");
    expect(chipTone("neutral")).toBe("todo");
  });

  it("infers the mime type from the extension when the browser gives none", () => {
    expect(toUploadInput({ name: "scan.JPG", size: 10, type: "" }).mime).toBe("image/jpeg");
    expect(toUploadInput({ name: "x.bin", size: 10, type: "" }).mime).toBe("application/octet-stream");
  });

  it("validates size and type before uploading", () => {
    expect(validateUpload({ name: "a.pdf", size: 1000, type: "application/pdf" })).toBeNull();
    expect(validateUpload({ name: "a.pdf", size: 0, type: "application/pdf" })).toMatch(/empty/);
    expect(validateUpload({ name: "a.pdf", size: 26 * 1024 * 1024, type: "application/pdf" })).toMatch(/limit/);
    expect(validateUpload({ name: "a.exe", size: 10, type: "application/x-msdownload" })).toMatch(/PDF, Word/);
  });

  it("recognises the demo upload marker", () => {
    expect(isDemoUploadUrl("demo://upload/doc-1")).toBe(true);
    expect(isDemoUploadUrl("https://x.supabase.co/storage/v1/upload")).toBe(false);
  });
});

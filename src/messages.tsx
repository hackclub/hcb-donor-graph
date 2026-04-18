import { readFile } from "node:fs/promises";
import React from "react";
import satori, { SatoriOptions } from "satori";
import sharp from "sharp";

const width = 700;
const height = 160;

function Message({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                paddingLeft: "24px",
                paddingRight: "24px",
                backgroundColor: "#1a1a1a",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                color: "#888888",
                fontSize: 30,
                textAlign: "center",
                flexDirection: "column",
            }}
        >
            {children}
        </div>
    )
}

function NoDonors({ orgName }: { orgName: string }) {
    return (
        <Message>
            No donors yet, be the first to donate to {orgName}!
        </Message>
    );
}

function LinkIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-icon lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
    )
}

function NotFound({ orgSlug }: { orgSlug: string }) {
    return (
        <Message>
            <p style={{ color: "#e64553", fontSize: "24px", margin: "4px" }}>
                Organization "{orgSlug}" not found
            </p>
            <p style={{ margin: 0, fontSize: "20px" }}>Either the HCB org does not exist, or it is not in Transparency Mode.</p>
            <div style={{ fontSize: "16px", color: "#b4befe", display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                <LinkIcon />
                <p>graph.hcb.hackclub.com</p>
            </div>
        </Message>
    );
}

let fontData: Buffer | null = null;

async function getFontData(): Promise<Buffer> {
    if (!fontData) {
        fontData = await readFile("fonts/Inter-SemiBold.ttf");
    }
    return fontData;
}

async function generateMessage(children: React.ReactNode): Promise<Buffer> {
    const svg = await satori(
        children,
        {
            width,
            height,
            fonts: [
                {
                    name: "Inter",
                    data: await getFontData(),
                    weight: 400,
                    style: "normal",
                },
            ],
        } as SatoriOptions
    );
    return sharp(Buffer.from(svg)).png({ quality: 100 }).toBuffer();
}

export async function generateNoDonors(orgName: string): Promise<Buffer> {
    const message = <NoDonors orgName={orgName} />;
    return await generateMessage(message);
}

export async function generateNotFound(orgSlug: string): Promise<Buffer> {
    const message = <NotFound orgSlug={orgSlug} />;
    return await generateMessage(message);
}
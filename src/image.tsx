import React from "react";
import satori from "satori";
import sharp from "sharp";
import { generateNoDonors, generateNotFound } from "./messages.js";

interface AvatarGridProps {
    avatarUrls: string[];
    avatarSize?: number;
    gap?: number;
    columns?: number;
    backgroundColor?: string;
}

const AvatarGrid = ({
    avatarUrls,
    avatarSize = 60,
    gap = 8,
    backgroundColor = "#1a1a1a",
}: AvatarGridProps) => {
    const containerStyle = {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        padding: `${gap}px`,
        gap: `${gap}px`,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
    } as const;

    const avatarStyle = {
        width: `${avatarSize}px`,
        height: `${avatarSize}px`,
        borderRadius: "50%",
        objectFit: "cover",
        border: "2px solid #4a4a4a",
    } as const;

    return (
        <div
            style={{
                display: "flex",
                backgroundColor: backgroundColor,
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <div style={containerStyle}>
                {avatarUrls.map((url, index) => (
                    <img
                        key={url || index}
                        src={url}
                        alt={`Avatar ${index + 1}`}
                        style={avatarStyle}
                    />
                ))}
            </div>
        </div>
    );
};

export async function generateAvatarGridImage(
    width: number,
    height: number,
    avatarUrls: string[],
    iconSize: number,
    gap: number,
    orgSlug: string
) {
    if (avatarUrls.length === 0) {
        console.log("No avatars found, generating empty image");
        const response = await fetch(`http://hcb.hackclub.com/api/v3/organizations/${orgSlug}`);
        if (response.status === 404) {
            return await generateNotFound(orgSlug);
        }
        const orgData = await response.json();
        return await generateNoDonors(orgData.name);
    }

    const svg = await satori(
        <AvatarGrid avatarUrls={avatarUrls} avatarSize={iconSize} gap={gap} />,
        {
            width,
            height,
            fonts: [],
        }
    );

    return sharp(Buffer.from(svg)).png({ quality: 100 }).toBuffer();
}

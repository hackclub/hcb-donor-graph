import React from "react";

interface AvatarGridProps {
    avatarUrls: string[];
    avatarSize?: number;
    gap?: number;
    columns?: number;
    backgroundColor?: string;
}

export const AvatarGrid = ({
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

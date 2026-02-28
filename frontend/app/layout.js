import "./globals.css";

export const metadata = {
    title: "PvtCall",
    description: "Anonymous 1-to-1 random video chat. Login, get matched, talk.",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link
                    rel="stylesheet"
                    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                />
            </head>
            <body>{children}</body>
        </html>
    );
}

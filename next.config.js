/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "exceljs"],
  },
  async headers() {
    // Every page here can show real NIK/phone-number data, so beyond the login gate: block
    // framing (clickjacking), stop MIME-sniffing, and don't leak the URL (which can carry a
    // submission id) to third-party referrers.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

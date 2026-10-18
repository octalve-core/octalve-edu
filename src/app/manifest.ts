import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.name} Management Platform`,
    short_name: "Octalve",
    description: brand.description,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    orientation: "any",
    categories: ["education", "finance", "productivity"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Record Payment",
        short_name: "Payment",
        description: "Quickly record an offline student payment",
        url: "/dashboard?tool=payment-recorder",
      },
      {
        name: "School Calculator",
        short_name: "Calculator",
        description: "Tuition discount and term fee calculations",
        url: "/dashboard?tool=calculator",
      },
      {
        name: "Take Attendance",
        short_name: "Attendance",
        description: "Mark class roll-call attendance",
        url: "/dashboard?action=attendance",
      },
      {
        name: "Broadcast Alert",
        short_name: "Broadcast",
        description: "Send urgent SMS or notice",
        url: "/dashboard?tool=broadcast",
      },
      {
        name: "Payment Link & QR",
        short_name: "Pay Link",
        description: "Generate instant Paystack checkout link or QR code",
        url: "/dashboard?tool=payment-link",
      },
    ],
  };
}

import { Request, Response } from "express";
import { verifyWebhook } from "@clerk/express/webhooks";
import { prisma } from "../configs/prisma.js";
import * as Sentry from "@sentry/node";

const clerkWebhooks = async (req: Request, res: Response) => {
  console.log("🚨 WEBHOOK FUNCTION CALLED");
  try {
    const evt: any = await verifyWebhook(req);
    const { data, type } = evt;
    console.log("✅ Webhook type:", type);

    switch (type) {
      case "user.created": {
        await prisma.user.create({
          data: {
            id: data.id,
            email: data?.email_addresses[0]?.email_address,
            name: data?.first_name + " " + data?.last_name,
            image: data?.image_url,
          },
        });
        break;
      }

      case "user.updated": {
        await prisma.user.update({
          where: { id: data.id },
          data: {
            email: data?.email_addresses[0]?.email_address,
            name: data?.first_name + " " + data?.last_name,
            image: data?.image_url,
          },
        });
        break;
      }

      case "user.deleted": {
        await prisma.user.delete({ where: { id: data.id } });
        break;
      }

      case "paymentAttempt.updated": {
        console.log("💳 Payment status:", data.status);
        console.log("👤 clerkUserId:", data?.payer?.user_id);
        console.log("📋 planSlug:", data?.subscription_items?.[0]?.plan?.slug);

        if (data.status === "paid") {
          const credits = { pro: 80, premium: 240 };
          const clerkUserId = data?.payer?.user_id;
          const planId: keyof typeof credits =
            data?.subscription_items?.[0]?.plan?.slug;

          if (planId !== "pro" && planId !== "premium") {
            return res.status(400).json({ message: "invalid plan" });
          }

          const user = await prisma.user.findUnique({
            where: { id: clerkUserId },
          });
          console.log("👤 User found:", user?.id);

          if (!user) {
            return res.status(404).json({ message: "user not found in DB" });
          }

          await prisma.user.update({
            where: { id: clerkUserId },
            data: { 
              credits: { increment: credits[planId] },
              plan: planId
            },
          });
          console.log("✅ Credits updated!");
        }
        break;
      }

      default:
        break;
    }

    res.json({ message: "Webhook Received: " + type });
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ message: error.message });
  }
};

export default clerkWebhooks;

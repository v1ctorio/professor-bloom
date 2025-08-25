import { AppHomeOpenedEvent, Middleware, SlackEventMiddlewareArgs, View } from "@slack/bolt";
import { PrismaClient } from "@prisma/client";
import { slackClient } from "src";

type HomeEvent = Middleware<SlackEventMiddlewareArgs<"app_home_opened">>;
enum AuthLevel {
  Unauthorized,
  Gardener,
  Admin
}
const prisma = new PrismaClient();

const getAllWelcomers = async () =>
  await prisma.user.findMany({
    select: {
      slack: true,
      id: true,
      admin: true,
      welcomesGiven: true,
      totalWelcomeTime: true,
    },
  });

const createDashboardSection = async (event: any): Promise<any[]> => {
  const stats = await prisma.slackStats.findFirst({ where: { id: 1 } });
  const totalWelcomed = stats?.totalWelcomed || 0;
  const pendingWelcomes = stats?.pendingWelcomes || 0;

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🌸 Professor Bloom's Dashboard 🌸",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Welcome, <@${event.user}>!* :wave: Here's your garden overview:`,
      },
    },
    { type: "divider" },
    {
      type: "header",
      text: { type: "plain_text", text: "🌍 Global Stats", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*👋 Total Welcomed:* ${totalWelcomed}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🌱 Pending Welcomes:* ${pendingWelcomes}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Quick Actions*" },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Edit Welcome Template",
            emoji: true,
          },
          action_id: "edit_welcome_template",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "View Statistics", emoji: true },
          action_id: "view_statistics",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Welcome oldest pending user",
            emoji: true,
          },
          action_id: "welcome_oldest_pending",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":seedling: Remember to take breaks and stay hydrated!",
        },
      ],
    },
  ];
};

const createAdminSection = async (): Promise<any[]> => {
  const allWelcomers = await getAllWelcomers();

  const welcomerStatsBlocks = [
    { type: "divider" },
    {
      type: "header",
      text: { type: "plain_text", text: "👥 Welcomer Stats", emoji: true },
    },
  ];

  const welcomerStats = await Promise.all(
    allWelcomers.map(async (welcomer) => {
      const user = await prisma.user.findUnique({
        where: { slack: welcomer.slack },
        select: { welcomesGiven: true, totalWelcomeTime: true },
      });

      const avgWelcomeTime = user?.welcomesGiven
        ? Math.round(user.totalWelcomeTime / user.welcomesGiven / 60000)
        : 0;

      return {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• <@${welcomer.slack}> (${welcomer.id})${
            welcomer.admin ? " 👑" : ""
          }\n  Welcomes: ${user?.welcomesGiven || 0} | Avg Time: ${avgWelcomeTime} min`,
        },
        accessory: {
          type: "overflow",
          options: [
            {
              text: {
                type: "plain_text",
                text: "View/Edit Transcript",
                emoji: true,
              },
              value: `view_edit_transcript::${welcomer.slack}`,
            },
            {
              text: {
                type: "plain_text",
                text: "Remove Welcomer",
                emoji: true,
              },
              value: `remove_welcomer::${welcomer.slack}`,
            },
            {
              text: {
                type: "plain_text",
                text: `${welcomer.admin ? "Remove Admin" : "Make Admin"}`,
                emoji: true,
              },
              value: `toggle_admin::${welcomer.slack}`,
            },
            {
              text: {
                type: "plain_text",
                text: "View Welcomed Users",
                emoji: true,
              },
              value: `view_welcomed_users::${welcomer.slack}`,
            },
          ],
          action_id: "welcomer_actions",
        },
      };
    }),
  );

  return [
    ...welcomerStatsBlocks,
    ...welcomerStats,
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "➕ Add Welcomer", emoji: true },
          style: "primary",
          action_id: "add_welcomer",
        },
      ],
    },
  ];
};

export const createHomeView = async (
  event: AppHomeOpenedEvent,
  authLevel: AuthLevel,
  installed: boolean
): Promise<View> => {
  
  
  if (authLevel === AuthLevel.Unauthorized) {
    return {
	"type": "home",
	"blocks": [
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "I help introducing people to the community!."
			}
		}
	]
}
  }

  if (!installed) { 
    const installURL = process.env.SLACK_INSTALL_URL;
    return {
      type: "home",
      blocks: [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "You are authorized but your "
          }
        }
      ]
    }
  }
  
  

  
  return {
    type: "home",
    blocks: [
      ...(await createDashboardSection(event)),
      ...(authLevel == AuthLevel.Admin ? await createAdminSection() : []),
      ],
    }
  };

export const userAuthLevel = async (userId: string): Promise<AuthLevel> => {
  const user = await prisma.user.findUnique({
    where: { slack: userId },
    select: { admin: true },
  });
  console.log({user})

  if(!user) {
    return AuthLevel.Unauthorized
  }
  
  return user.admin ? AuthLevel.Admin : AuthLevel.Gardener;
};

export const userIsAppInstalled = async (userId: string): Promise<boolean> => {
  const count = await prisma.slackToken.count({
    where: { userId }
  });

  console.log("IT IS INSTALLED COUNT: ",count)
  return count > 0
}

export const handleHomeTab: HomeEvent = async ({ event, client }) => {
  console.log("Received home view")
  try {
    const authLevel = await userAuthLevel(event.user);
    const isInstalled = await userIsAppInstalled(event.user);
    await client.views.publish({
      user_id: event.user,
      view: await createHomeView(event, authLevel, isInstalled),
    });
  } catch (error) {
    console.error("Error publishing home view:", error);
  }
};

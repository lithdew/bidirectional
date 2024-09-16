import { faker } from "@faker-js/faker";
import * as uuid from "uuid";

function createMockMessage(index: number) {
  return {
    id: uuid.v4(),
    index,
    sentAt: new Date(
      new Date("2024-09-10T15:28:35.160Z").getTime() +
        index * 60 * 60 * 1 * 1000,
    ).toISOString(),
    content: faker.lorem.lines(),
  };
}

type Message = ReturnType<typeof createMockMessage>;

export const MESSAGES: Message[] = Array.from({ length: 1000 }, (_, i) =>
  createMockMessage(i),
);

export const createNewMessage = () => {
  MESSAGES.push(createMockMessage(MESSAGES.length));
};

export const listMessages = async (input: {
  cursor: { direction: "desc" | "asc"; sentAt: string; id: string } | null;
}) => {
  const LIMIT = 20;

  let messages = MESSAGES;

  // ORDER BY sent_at DESC, id ASC;

  messages = messages.sort((a, b) => {
    // Sort by sentAt in descending order, then id in ascending order.

    if (new Date(a.sentAt).getTime() === new Date(b.sentAt).getTime()) {
      return a.id.localeCompare(b.id);
    }

    return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
  });

  let start = 0;
  let end = messages.length;

  let cursor: { direction: "desc" | "asc"; sentAt: string; id: string } | null =
    input.cursor;
  let next: { direction: "desc" | "asc"; sentAt: string; id: string } | null =
    null;
  let prev: { direction: "desc" | "asc"; sentAt: string; id: string } | null =
    null;

  if (input.cursor !== null) {
    switch (input.cursor.direction) {
      case "asc": {
        for (start = start; start < messages.length; start++) {
          const message = messages[start];
          if (message === undefined) {
            break;
          }
          if (
            new Date(message.sentAt) < new Date(input.cursor.sentAt) ||
            (message.sentAt === input.cursor.sentAt &&
              message.id.localeCompare(input.cursor.id) >= 0)
          ) {
            break;
          }
          continue;
        }

        end = Math.min(start + LIMIT, messages.length);

        break;
      }
      case "desc": {
        for (end = end; end > 0; end--) {
          const message = messages[end - 1];
          if (message === undefined) {
            break;
          }
          if (
            new Date(message.sentAt) > new Date(input.cursor.sentAt) ||
            (message.sentAt === input.cursor.sentAt &&
              message.id.localeCompare(input.cursor.id) < 0)
          ) {
            break;
          }
          continue;
        }

        start = Math.max(end - LIMIT, 0);

        break;
      }
    }
  } else {
    start = 0;
    end = Math.min(start + LIMIT, messages.length);
  }

  const first = messages[start];
  if (cursor === null && first !== undefined) {
    cursor = { direction: "asc", sentAt: first.sentAt, id: first.id };
  }

  const lag = messages[start - 1];
  const lead = messages[end];

  // SELECT lead(id, $page_size) OVER () AS next FROM ordered_filtered_messages LIMIT 1;
  if (lead !== undefined) {
    next = { direction: "asc", sentAt: lead.sentAt, id: lead.id };
  }

  // SELECT id AS previous FROM ordered_filtered_messages LIMIT 1;
  if (lag !== undefined && first !== undefined) {
    prev = { direction: "desc", sentAt: first.sentAt, id: first.id };
  }

  messages = messages.slice(start, end);

  return {
    data: messages,
    start,
    end,
    cursor,
    next,
    prev,
  };
};

export type ListMessagesResponse = Awaited<ReturnType<typeof listMessages>>;

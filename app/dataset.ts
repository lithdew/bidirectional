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
  direction: "desc" | "asc";
  cursor?: { sentAt: string; id: string };
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
  let end = Math.min(start + LIMIT, messages.length);

  if (input.cursor !== undefined) {
    const cursor = input.cursor;

    switch (input.direction) {
      case "asc": {
        for (start = start; start < messages.length; start++) {
          const message = messages[start];
          if (message === undefined) {
            break;
          }
          if (
            new Date(message.sentAt) < new Date(cursor.sentAt) ||
            (message.sentAt === cursor.sentAt &&
              message.id.localeCompare(cursor.id) >= 0)
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
            new Date(message.sentAt) > new Date(cursor.sentAt) ||
            (message.sentAt === cursor.sentAt &&
              message.id.localeCompare(cursor.id) < 0)
          ) {
            break;
          }
          continue;
        }

        start = Math.max(end - LIMIT, 0);

        break;
      }
    }
  }

  let cursor: { sentAt: string; id: string } | undefined = input.cursor;
  let next: { sentAt: string; id: string } | null = null;
  let prev: { sentAt: string; id: string } | null = null;

  const first = messages[start];
  if (cursor === undefined && first !== undefined) {
    cursor = { sentAt: first.sentAt, id: first.id };
  }

  // SELECT lead(id, $page_size) OVER () AS next FROM ordered_filtered_messages LIMIT 1;
  const lead = messages[end];
  if (lead !== undefined) {
    next = { sentAt: lead.sentAt, id: lead.id };
  }

  // SELECT id AS previous FROM ordered_filtered_messages LIMIT 1;
  const lag = messages[start - 1];
  if (lag !== undefined && first !== undefined) {
    prev = { sentAt: first.sentAt, id: first.id };
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

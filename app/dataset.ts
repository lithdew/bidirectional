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

  // ORDER BY sent_at (DESC | ASC), id (ASC | DESC)

  switch (input.direction) {
    case "asc": {
      messages = messages.sort((a, b) => {
        // Sort by sentAt in descending order, then id in ascending order.

        if (new Date(a.sentAt).getTime() === new Date(b.sentAt).getTime()) {
          return a.id.localeCompare(b.id);
        }

        return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
      });
      break;
    }
    case "desc": {
      messages = messages.sort((a, b) => {
        // Sort by sentAt in ascending, then id in descending order.

        if (new Date(a.sentAt).getTime() === new Date(b.sentAt).getTime()) {
          return b.id.localeCompare(a.id);
        }

        return new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime();
      });
      break;
    }
  }

  // WHERE id = $cursor
  // WHERE message.sent_at < $sent_at OR (message.sent_at = $sent_at AND message.id > $id)

  let start = 0;
  let end = Math.min(start + LIMIT, messages.length);

  if (input.cursor !== undefined) {
    traverse: for (
      start = start;
      start < messages.length;
      start++, end = Math.min(start + LIMIT, messages.length)
    ) {
      const message = messages[start];
      if (message === undefined) {
        break traverse;
      }

      switch (input.direction) {
        case "asc": {
          if (
            new Date(message.sentAt) < new Date(input.cursor.sentAt) ||
            (message.sentAt === input.cursor.sentAt &&
              message.id >= input.cursor.id)
          ) {
            break traverse;
          }

          continue traverse;
        }
        case "desc": {
          if (
            new Date(message.sentAt) > new Date(input.cursor.sentAt) ||
            (message.sentAt === input.cursor.sentAt &&
              message.id <= input.cursor.id)
          ) {
            break traverse;
          }

          continue traverse;
        }
      }
    }
  }

  let cursor: { sentAt: string; id: string } | undefined = undefined;
  let next: { sentAt: string; id: string } | null = null;
  let prev: { sentAt: string; id: string } | null = null;

  const first = messages[start];
  if (first !== undefined) {
    cursor = { sentAt: first.sentAt, id: first.id };
  }

  // SELECT lead(id, $page_size) OVER () AS next FROM ordered_filtered_messages LIMIT 1;
  const lead = messages[end];
  if (lead !== undefined) {
    next = { sentAt: lead.sentAt, id: lead.id };
  }

  // SELECT lag(id, 1) OVER () AS previous FROM ordered_filtered_messages LIMIT 1;
  const lag = messages[start - 1];
  if (lag !== undefined) {
    prev = { sentAt: lag.sentAt, id: lag.id };
  }

  messages = messages.slice(start, end);
  if (input.direction === "desc") {
    [next, prev] = [prev, next];
    messages = messages.reverse();
  }

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

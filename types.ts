import type { Context } from 'grammy';

export interface BotConfig {
  newName: string | null;
}

export type MyContext = Context & {
  config: BotConfig;
};

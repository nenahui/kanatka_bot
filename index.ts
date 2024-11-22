import { Bot, GrammyError, HttpError, Keyboard } from 'grammy';
import { configDotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

configDotenv();

const bot = new Bot(process.env.TOKEN as string);
const prisma = new PrismaClient();

const userStates: Record<number, string> = {};

bot.command('start', async (ctx) => {
  const userTgId = ctx.from?.id;
  const fullName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim();
  const username = ctx.from?.username;
  const startKeyboard = new Keyboard().text('Изменить имя').text('Добавить слово').resized();

  if (!userTgId || !username) {
    return ctx.reply('Произошла ошибка при получении данных о пользователе!');
  }

  const isUserExist = await prisma.user.findFirst({
    where: { userTgId },
  });

  if (isUserExist) {
    return ctx.reply(`Привет! ${isUserExist.fullName}\nОбсирать любишь да?)`, {
      reply_markup: startKeyboard,
    });
  }

  const user = await prisma.user.create({
    data: { userTgId, fullName, username },
  });

  await ctx.reply(`Привет! ${user.fullName}\nОбсирать любишь да?)`, {
    reply_markup: startKeyboard,
  });
});

bot.hears('Изменить имя', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) {
    return ctx.reply('Произошла ошибка при получении данных о пользователе!');
  }

  userStates[userTgId] = 'waiting_for_new_name';
  await ctx.reply('Введите новое имя:');
});

bot.hears('Добавить слово', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) {
    return ctx.reply('Произошла ошибка при получении данных о пользователе!');
  }

  userStates[userTgId] = 'waiting_for_new_word';
  await ctx.reply('Введите слово:');
});

bot.on('message', async (ctx) => {
  const userTgId = ctx.from?.id;
  const message = ctx.message?.text;

  if (!userTgId || !message) {
    return ctx.reply('Произошла ошибка при обработке сообщения!');
  }

  if (userStates[userTgId] === 'waiting_for_new_name') {
    await prisma.user.update({
      where: { userTgId },
      data: { fullName: message },
    });

    userStates[userTgId] = '';
    await ctx.reply(`Имя успешно изменено на ${message}`);
  }

  if (userStates[userTgId] === 'waiting_for_new_word') {
    await prisma.word.create({
      data: { word: message, author: { connect: { userTgId } } },
    });

    userStates[userTgId] = '';
    await ctx.reply(`Слово успешно добавлено: ${message}`);
  }
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;

  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

bot.start().then(() => console.log('Бот запущен!'));

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await bot.stop();
});
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await bot.stop();
});

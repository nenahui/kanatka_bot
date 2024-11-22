import { Bot, GrammyError, HttpError } from 'grammy';
import { configDotenv } from 'dotenv';
import { PrismaClient, type Word } from '@prisma/client';

configDotenv();

const bot = new Bot(process.env.TOKEN as string);
const prisma = new PrismaClient();
const superUser = process.env.SUPER_ADMIN_ID as string;

const userStates: Record<number, string> = {};

const STATES = {
  WAITING_FOR_NEW_NAME: 'waiting_for_new_name',
  WAITING_FOR_NEW_WORD: 'waiting_for_new_word',
};

const ROLE = {
  MODERATOR: 'moderator',
  USER: 'user',
};

const handleError = (ctx: any, message: string) => ctx.reply(message);

const getUser = async (userTgId: number) => {
  return prisma.user.findFirst({ where: { userTgId } });
};

const addWord = async (userTgId: number, word: string) => {
  await prisma.word.create({ data: { word, author: { connect: { userTgId } } } });
};

const updateUserName = async (userTgId: number, newName: string) => {
  await prisma.user.update({
    where: { userTgId },
    data: { fullName: newName },
  });
};

bot.command('start', async (ctx) => {
  const userTgId = ctx.from?.id;
  const fullName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim();
  const username = ctx.from?.username;

  if (!userTgId || !username) {
    return handleError(
      ctx,
      'Произошла ошибка при получении данных о пользователе!\nВозможно у вас неуказан юзернейм в профиле.',
    );
  }

  const isUserExist = await getUser(userTgId);

  if (isUserExist) {
    return ctx.reply(`С возвращением ${isUserExist.fullName}👏\nДобавь меня в группу и веселись🎉`);
  }

  const user = await prisma.user.create({
    data: { userTgId, fullName, username },
  });

  return ctx.reply(`Салам! ${user.fullName}👏\nДобавь меня в группу и веселись🎉`);
});

bot.hears('!изменить имя', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  userStates[userTgId] = STATES.WAITING_FOR_NEW_NAME;
  await ctx.reply('Введите новое имя:');
});

bot.hears('!добавить слово', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  const user = await getUser(userTgId);

  if (user?.role === ROLE.USER) {
    return ctx.reply('У вас нет прав для добавления новых слов.');
  }

  userStates[userTgId] = STATES.WAITING_FOR_NEW_WORD;
  await ctx.reply('Введите слово:');
});

bot.on('message', async (ctx) => {
  const userTgId = ctx.from?.id;
  const message = ctx.message?.text;
  const repliedToMessage = ctx.message?.reply_to_message;

  if (!userTgId || !message) {
    return handleError(ctx, 'Произошла ошибка при обработке сообщения!');
  }

  if ((message === '!повысить' || message === '!понизить') && repliedToMessage) {
    if (String(userTgId) === superUser) {
      const targetUserId = repliedToMessage.from?.id;

      if (!targetUserId) return handleError(ctx, 'Не удалось определить пользователя для повышения.');

      const targetUser = await getUser(targetUserId);

      if (!targetUser) return handleError(ctx, 'Этот пользователь не зарегистрирован у меня.');

      if (message === '!повысить' && targetUser.role === ROLE.MODERATOR) {
        return handleError(ctx, 'Этот пользователь уже имеет роль модератора.');
      }

      if (message === '!понизить' && targetUser.role === ROLE.USER) {
        return handleError(ctx, 'Этот пользователь уже имеет роль пользователя.');
      }

      if (message === '!повысить') {
        await prisma.user.update({
          where: { userTgId: targetUserId },
          data: { role: ROLE.MODERATOR },
        });
        return ctx.reply(`Пользователь ${targetUser.fullName} успешно повышен до модератора.`);
      } else {
        await prisma.user.update({
          where: { userTgId: targetUserId },
          data: { role: ROLE.USER },
        });
        return ctx.reply(`Пользователь ${targetUser.fullName} успешно понижен до дебила.`);
      }
    } else {
      return handleError(ctx, 'Чепушила, ты не достоин этой команды!');
    }
  }

  if (userStates[userTgId] === STATES.WAITING_FOR_NEW_NAME) {
    await updateUserName(userTgId, message);
    userStates[userTgId] = '';
    return ctx.reply(`Имя успешно изменено на ${message}`);
  }

  if (userStates[userTgId] === STATES.WAITING_FOR_NEW_WORD) {
    await addWord(userTgId, message);
    userStates[userTgId] = '';
    return ctx.reply(`Слово успешно добавлено: ${message}`);
  }

  if (repliedToMessage?.from?.id === ctx.me.id) {
    const randomWordResponse = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "Word" ORDER BY RANDOM() LIMIT 1;`,
    )) as Word[];
    const randomWord = randomWordResponse[0];

    if (randomWord) {
      await ctx.reply(randomWord.word, { reply_to_message_id: ctx.message.message_id });
    }
    return;
  }

  if (Math.random() < 0.05) {
    const randomWordResponse = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "Word" ORDER BY RANDOM() LIMIT 1;`,
    )) as Word[];
    const randomWord = randomWordResponse[0];

    if (randomWord) {
      await ctx.reply(randomWord.word, { reply_to_message_id: ctx.message.message_id });
    }
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

import { requireOwner } from '~~/server/utils/auth';
import { taskSchema, saveTask } from '~~/server/services/project-tasks';

/** Create or edit (when `taskId` is present) a task. */
export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing project id' });

	const body = await readValidatedBody(event, taskSchema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid task' });

	const task = await saveTask(event, owner.id, id, body.data);
	return { task };
});

import { requireOwner } from '~~/server/utils/auth';
import { deleteTask } from '~~/server/services/project-tasks';

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	const taskId = getRouterParam(event, 'taskId');
	if (!id || !taskId) throw createError({ statusCode: 400, statusMessage: 'Missing id' });
	await deleteTask(event, owner.id, id, taskId);
	return { ok: true };
});

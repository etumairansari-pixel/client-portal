import type { H3Event } from 'h3';
import { prisma } from '../utils/prisma';

export type AuditAction =
	| 'USER_LOGIN'
	| 'USER_LOGOUT'
	| 'CLIENT_CREATED'
	| 'CLIENT_UPDATED'
	| 'CLIENT_SUSPENDED'
	| 'CLIENT_ACTIVATED'
	| 'CLIENT_ACCESS_RESET'
	| 'PROJECT_CREATED'
	| 'PROJECT_UPDATED'
	| 'PROJECT_DELETED'
	| 'PASSWORD_CHANGED'
	| 'PASSWORD_RESET_REQUESTED'
	| 'PASSWORD_RESET_COMPLETED'
	// --- scope lifecycle ---
	| 'SCOPE_CREATED'
	| 'SCOPE_DRAFT_SAVED'
	| 'SCOPE_SUBMITTED'
	| 'SCOPE_REVIEW_STARTED'
	| 'CLARIFICATION_REQUESTED'
	| 'CLARIFICATION_RESPONDED'
	| 'CLARIFICATION_RESOLVED'
	| 'SCOPE_MESSAGE_SENT'
	| 'SCOPE_FILE_UPLOADED'
	| 'SCOPE_FILE_DELETED'
	| 'SCOPE_READY_FOR_APPROVAL'
	| 'SCOPE_CLIENT_APPROVED'
	| 'SCOPE_APPROVED'
	// --- requirements / SRS ---
	| 'SRS_CREATED'
	| 'SRS_DRAFT_SAVED'
	| 'SRS_VERSION_CREATED'
	| 'SRS_SENT_FOR_REVIEW'
	| 'SRS_CHANGE_REQUESTED'
	| 'SRS_MESSAGE_POSTED'
	| 'SRS_DISCUSSION_RESOLVED'
	| 'SRS_REQUIREMENT_SAVED'
	| 'SRS_REQUIREMENT_REMOVED'
	| 'SRS_ATTACHMENT_UPLOADED'
	| 'SRS_READY_FOR_APPROVAL'
	| 'SRS_APPROVED'
	| 'PROJECT_READY_FOR_DELIVERY'
	// --- delivery workspace ---
	| 'PROJECT_STAGE_CHANGED'
	| 'PROJECT_HEALTH_CHANGED'
	| 'MILESTONE_CREATED'
	| 'MILESTONE_UPDATED'
	| 'MILESTONE_COMPLETED'
	| 'MILESTONE_DELETED'
	| 'MILESTONES_REORDERED'
	| 'PROJECT_TASK_CREATED'
	| 'PROJECT_TASK_UPDATED'
	| 'PROJECT_TASK_COMPLETED'
	| 'PROJECT_TASK_DELETED'
	| 'PROJECT_UPDATE_POSTED'
	| 'CHANGE_REQUEST_CREATED'
	| 'CHANGE_REQUEST_REVIEW_STARTED'
	| 'CHANGE_REQUEST_CLARIFICATION_REQUESTED'
	| 'CHANGE_REQUEST_REPLIED'
	| 'CHANGE_REQUEST_ACCEPTED'
	| 'CHANGE_REQUEST_DECLINED'
	| 'CHANGE_REQUEST_STARTED'
	| 'CHANGE_REQUEST_COMPLETED'
	| 'CHANGE_REQUEST_ATTACHMENT_UPLOADED';

/**
 * Append-only record of meaningful actions.
 * Never pass passwords, tokens or secrets in `metadata`.
 */
export async function recordAudit(
	event: H3Event | null,
	params: {
		actorUserId?: string | null;
		action: AuditAction;
		entityType?: string;
		entityId?: string;
		metadata?: Record<string, unknown>;
	},
) {
	try {
		await prisma.auditLog.create({
			data: {
				actorUserId: params.actorUserId ?? null,
				action: params.action,
				entityType: params.entityType ?? null,
				entityId: params.entityId ?? null,
				metadata: (params.metadata ?? {}) as object,
				ip: event ? (getRequestIP(event, { xForwardedFor: true }) ?? null) : null,
			},
		});
	} catch {
		// Auditing must never break the request it is recording.
	}
}

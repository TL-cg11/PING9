// Document와 Trace의 형태 스키마 (AD-9). 여기서는 형태만 본다.
// 값의 형식(IP, 이름), 참조, 유일성, 한도는 validate.ts가 구별되는 오류 코드로 확인한다.
// 정의되지 않은 필드는 해석 결과에서 빠진다.

import { z } from "zod";

import { DROP_REASONS, REASON_CODES } from "./codes";
import type { TopologyDocument } from "./document";
import { OS_KINDS, SWITCHPORT_MODES } from "./document";
import { LIMITS } from "./limits";
import type { Trace } from "./trace";
import { TRACE_ACTIONS, TRACE_LAYERS, TRACE_STATUSES } from "./trace";

/** 문서 안의 모든 문자열의 최대 길이 (SEC-7). ID, 이름, 주소, 포트 이름이 모두 이 안에 든다 */
const MAX_STRING_LENGTH = 64;

const shortString = z.string().max(MAX_STRING_LENGTH);
const integer = z.number().int();
const coordinate = z.number().min(-LIMITS.maxPosition).max(LIMITS.maxPosition);

const positionSchema = z.object({ x: coordinate, y: coordinate });

const portRefSchema = z.object({ deviceId: shortString, port: shortString });

const pcConfigSchema = z.object({
  ip: shortString.optional(),
  mask: shortString.optional(),
  gateway: shortString.optional(),
  os: z.enum(OS_KINDS).optional(),
});

const vlanSchema = z.object({ id: integer, name: shortString });

const switchPortConfigSchema = z.object({
  adminUp: z.boolean(),
  mode: z.enum(SWITCHPORT_MODES),
  accessVlan: integer.optional(),
  allowedVlans: z.array(z.tuple([integer, integer])).optional(),
});

const switchConfigSchema = z.object({
  vlans: z.array(vlanSchema),
  ports: z.record(shortString, switchPortConfigSchema),
});

const routerInterfaceConfigSchema = z.object({
  adminUp: z.boolean(),
  ip: shortString.optional(),
  mask: shortString.optional(),
});

const staticRouteSchema = z.object({
  network: shortString,
  mask: shortString,
  nextHop: shortString,
});

const routerConfigSchema = z.object({
  interfaces: z.record(shortString, routerInterfaceConfigSchema),
  staticRoutes: z.array(staticRouteSchema),
});

const deviceBase = { id: shortString, name: shortString, position: positionSchema };

const deviceSchema = z.discriminatedUnion("kind", [
  z.object({ ...deviceBase, kind: z.literal("pc"), config: pcConfigSchema }),
  z.object({ ...deviceBase, kind: z.literal("switch"), config: switchConfigSchema }),
  z.object({ ...deviceBase, kind: z.literal("router"), config: routerConfigSchema }),
]);

const linkSchema = z.object({
  id: shortString,
  ends: z.tuple([portRefSchema, portRefSchema]),
});

export const topologyDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  devices: z.array(deviceSchema),
  links: z.array(linkSchema),
});

export type ParsedDocument = z.infer<typeof topologyDocumentSchema>;

// --- Trace ---

const reasonCodes = new Set<string>(REASON_CODES);
const dropReasons = new Set<string>(DROP_REASONS);

const frameSnapshotSchema = z.object({
  ethernet: z.object({
    sourceMac: shortString,
    destinationMac: shortString,
    vlanTag: integer.optional(),
  }),
  arp: z
    .object({
      operation: z.enum(["request", "reply"]),
      senderMac: shortString,
      senderIp: shortString,
      targetMac: shortString,
      targetIp: shortString,
    })
    .optional(),
  ipv4: z
    .object({ sourceIp: shortString, destinationIp: shortString, ttl: integer })
    .optional(),
  icmp: z.discriminatedUnion("type", [
    z.object({ type: z.enum(["echo-request", "echo-reply"]), sequence: integer }),
    z.object({ type: z.enum(["destination-unreachable", "time-exceeded"]), sequence: integer,
      original: z.object({ sourceIp: shortString, destinationIp: shortString, sequence: integer }) }),
  ]).optional(),
});

const traceEventSchema = z.object({
  seq: integer.min(0),
  time: integer.min(0),
  frameId: integer.min(1),
  parentSeq: integer.min(0).optional(),
  deviceId: shortString,
  inPort: shortString.optional(),
  outPort: shortString.optional(),
  linkId: shortString.optional(),
  layer: z.enum(TRACE_LAYERS),
  action: z.enum(TRACE_ACTIONS),
  reason: z.object({
    code: z.string().refine((code) => reasonCodes.has(code)),
    params: z.record(z.string(), z.unknown()),
  }),
  frame: frameSnapshotSchema,
  dropReason: z
    .string()
    .refine((code) => dropReasons.has(code))
    .optional(),
});

export const traceSchema = z.object({
  id: integer.min(1),
  docVersion: integer.min(0),
  events: z.array(traceEventSchema).max(LIMITS.maxTraceEvents),
  result: z.object({
    status: z.enum(TRACE_STATUSES),
    primaryDropSeq: integer.min(0).optional(),
  }),
});

// --- 스키마와 타입이 어긋나면 여기서 타입 오류가 난다 ---

type DeepMutable<T> = T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } : T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type Assert<T extends true> = T;

/** @internal 스키마가 해석한 값은 TopologyDocument이고, TopologyDocument는 스키마의 형태다 */
export type DocumentSchemaMatchesType = [
  Assert<IsAssignable<ParsedDocument, TopologyDocument>>,
  Assert<IsAssignable<DeepMutable<TopologyDocument>, ParsedDocument>>,
];

/** @internal Trace 타입의 값은 스키마의 형태다 (코드와 params의 짝은 타입만 확인한다) */
export type TraceSchemaMatchesType = Assert<
  IsAssignable<DeepMutable<Omit<Trace, "events">>, Omit<z.infer<typeof traceSchema>, "events">>
>;

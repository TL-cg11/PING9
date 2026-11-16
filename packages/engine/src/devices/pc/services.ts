// T0.20: 서버로 쓰는 PC의 서비스가 내는 응답. 요청의 첫 줄과 구성만으로 정해지는 순수 함수다.
// 단순화: 웹 문서와 파일은 정해진 것 둘뿐이고 고칠 수 없다. FTP는 로그인 없이 제어 연결 하나로 목록과 파일을 준다.
// DNS는 A 레코드만, NTP는 시각 없이 계층(stratum)만 답한다 (시뮬레이터에는 벽시계가 없다).

import { SERVICE_KINDS, SERVICE_PORTS, dnsRecordsOf, servicesOf } from "@ping9/shared";
import type { PcDevice, ServiceKind } from "@ping9/shared";

export interface ServiceResponse {
  readonly message: string;
  readonly data?: string;
}

/** HTTP와 FTP가 함께 내주는 파일. 이름과 내용 */
export function serverFiles(pc: PcDevice): Readonly<Record<string, string>> {
  return {
    "index.html": `<html><body><h1>${pc.name}</h1><p>PING9 web server</p></body></html>`,
    "readme.txt": `Files on ${pc.name} are served over HTTP and FTP.`,
  };
}

/** 그 프로토콜과 포트에서 듣는 서비스. 서버가 아니거나 서비스를 껐으면 undefined */
export function listeningService(pc: PcDevice, protocol: "tcp" | "udp", port: number): ServiceKind | undefined {
  const enabled = servicesOf(pc.config);
  return SERVICE_KINDS.find((kind) => enabled.includes(kind) && SERVICE_PORTS[kind].protocol === protocol && SERVICE_PORTS[kind].port === port);
}

function fileNamed(pc: PcDevice, name: string): string | undefined {
  const files = serverFiles(pc);
  return Object.hasOwn(files, name) ? files[name] : undefined;
}

export function serviceResponse(pc: PcDevice, service: ServiceKind, message: string): ServiceResponse {
  const [verb = "", argument = ""] = message.split(" ");
  switch (service) {
    case "http": {
      if (verb !== "GET") return { message: "400 Bad Request", data: "<h1>400 Bad Request</h1>" };
      const data = fileNamed(pc, argument === "/" ? "index.html" : argument.replace(/^\//, ""));
      return data === undefined ? { message: "404 Not Found", data: "<h1>404 Not Found</h1>" } : { message: "200 OK", data };
    }
    case "ftp": {
      if (verb === "LIST") return { message: "226 Transfer complete", data: Object.keys(serverFiles(pc)).join("\n") };
      const data = verb === "RETR" ? fileNamed(pc, argument) : undefined;
      return data === undefined ? { message: "550 File not found" } : { message: "226 Transfer complete", data };
    }
    case "dns": {
      const record = dnsRecordsOf(pc.config).find((candidate) => candidate.name === argument);
      return { message: record === undefined ? `NXDOMAIN ${argument}` : `${record.name} A ${record.address}` };
    }
    case "ntp":
      return { message: "server stratum 1" };
  }
}

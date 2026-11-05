import { SHARED_PACKAGE_NAME } from "@ping9/shared";

// 패키지 연결 확인용 자리표시. T1.2.4에서 Simulator로 교체한다.
export const ENGINE_PACKAGE_NAME = "@ping9/engine";

// engine이 의존해도 되는 workspace 패키지는 shared뿐이다 (AD-2).
export const ENGINE_WORKSPACE_DEPENDENCIES = [SHARED_PACKAGE_NAME] as const;

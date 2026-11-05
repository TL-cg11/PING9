import { SHARED_PACKAGE_NAME } from "@ping9/shared";

// 패키지 연결 확인용 자리표시. T2.1.1에서 Hono 앱으로 교체한다.
export const API_PACKAGE_NAME = "@ping9/api";

// api가 의존해도 되는 workspace 패키지는 shared뿐이다. engine은 불러오지 않는다 (AD-1, AD-2).
export const API_WORKSPACE_DEPENDENCIES = [SHARED_PACKAGE_NAME] as const;

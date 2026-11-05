# Digest: isolation-security-r1-1

Topic: security and resource implications of server-side per-student network lab nodes (containers / network namespaces + web console) versus in-browser simulation.
Access date for every source: 2026-11-05. Budget used: 13 tool calls, 8 distinct pages read (source budget spent), 1 failed read (NIST SP 800-190 PDF), 2 web searches whose snippets are reported only under Leads.

Method caveat: pages were read through a fetch tool that summarizes with a small model. Quoted phrases are as that tool returned them and were not re-checked character by character against the live page.

## Findings

### Q1. Capabilities needed for network labs

1. `--privileged` "gives all capabilities to the container", enables access to all host devices, and reconfigures AppArmor/SELinux to allow the container nearly the same access to the host as a process outside a container; the page says "Use this flag with caution." | https://docs.docker.com/engine/containers/run/ | Docker Docs | undated | accessed 2026-11-05 | high | security

2. In Docker's capability tables, NET_ADMIN ("Perform various network-related operations"), SYS_ADMIN ("Perform a range of system administration operations") and SYS_MODULE are NOT granted by default; NET_RAW ("Use RAW and PACKET sockets") IS granted by default. | https://docs.docker.com/engine/containers/run/ | Docker Docs | undated | accessed 2026-11-05 | high | capability

3. Docker's own example shows `ip link add dummy0 type dummy` failing with "RTNETLINK answers: Operation not permitted" in a default container and succeeding with `--cap-add=NET_ADMIN`. So a lab node that creates interfaces or edits routes needs at least NET_ADMIN added beyond Docker's default set. | https://docs.docker.com/engine/containers/run/ | Docker Docs | undated | accessed 2026-11-05 | high | capability

4. Docker uses an allowlist of capabilities and states the best practice is "to remove all capabilities except those explicitly required"; adding capabilities makes Docker "less secure". It also says the default capability and mount set "may provide incomplete isolation" when combined with kernel vulnerabilities. | https://docs.docker.com/engine/security/ | Docker Docs | undated | accessed 2026-11-05 | high | security

5. Per capabilities(7), CAP_NET_ADMIN permits interface configuration, administration of IP firewall/masquerading, modifying routing tables, setting promiscuous mode and enabling multicasting. CAP_NET_RAW permits RAW and PACKET sockets. | https://man7.org/linux/man-pages/man7/capabilities.7.html | Linux man-pages project (man7.org), man-pages 6.19 | 2026-02-08 | accessed 2026-11-05 | high | capability

6. Per capabilities(7), CAP_SYS_ADMIN covers mount/umount/pivot_root, setns, creating namespaces, BPF and perf operations, device-cgroup rule changes, overriding RLIMIT_NPROC, and more. The page's note to kernel developers says "Don't choose CAP_SYS_ADMIN if you can possibly avoid it!" and that it "can plausibly be called 'the new root'". | https://man7.org/linux/man-pages/man7/capabilities.7.html | Linux man-pages project, man-pages 6.19 | 2026-02-08 | accessed 2026-11-05 | high | security

7. Kubernetes Pod Security Standards, Baseline profile: privileged containers "must be disallowed", sharing host namespaces (hostNetwork/hostPID/hostIPC) "must be disallowed", and added capabilities are limited to a list (AUDIT_WRITE, CHOWN, DAC_OVERRIDE, FOWNER, FSETID, KILL, MKNOD, NET_BIND_SERVICE, SETFCAP, SETGID, SETPCAP, SETUID, SYS_CHROOT) that contains none of NET_ADMIN, SYS_ADMIN, NET_RAW. | https://kubernetes.io/docs/concepts/security/pod-security-standards/ | Kubernetes project | last modified 2026-10-16 | accessed 2026-11-05 | high | security

8. Kubernetes Restricted profile: containers must drop ALL capabilities and may add back only NET_BIND_SERVICE. The Privileged profile is "purposely-open, and entirely unrestricted" and "typically aimed at system- and infrastructure-level workloads managed by privileged, trusted users." | https://kubernetes.io/docs/concepts/security/pod-security-standards/ | Kubernetes project | last modified 2026-10-16 | accessed 2026-11-05 | high | security

9. Inference from 7 and 8 (not a statement in the source): a lab pod that needs NET_ADMIN fails both Baseline and Restricted, so it only fits the profile Kubernetes reserves for trusted users. Students are not that. | derived from https://kubernetes.io/docs/concepts/security/pod-security-standards/ | Kubernetes project | last modified 2026-10-16 | accessed 2026-11-05 | medium | security

### Q2. Interactive shell for untrusted users, shared kernel

10. Docker's security page ties container isolation to kernel namespaces and cgroups and warns that kernel vulnerabilities can defeat the default restrictions (see 4). It states the daemon requires root unless Rootless mode is used and that only trusted users should be allowed to control the daemon. | https://docs.docker.com/engine/security/ | Docker Docs | undated | accessed 2026-11-05 | high | security

11. Docker's security page gives no dedicated guidance for handing untrusted users a shell; the nearest statements are that containers are "by default, quite secure; especially if you run your processes as non-privileged users inside the container", and that if containers are provisioned through an API you should be "even more careful than usual with parameter checking". The second applies directly to a web backend that creates lab nodes on student request. | https://docs.docker.com/engine/security/ | Docker Docs | undated | accessed 2026-11-05 | medium | security

12. Kubernetes states that with a sandboxed runtime (it names gVisor and Kata Containers) "the need to restrict privileged permissions is lessened when the workload is isolated from the underlying kernel. This allows for workloads requiring heightened permissions to still be isolated." It adds that protection is "highly dependent on the method of sandboxing" and no single profile is recommended. This is the authoritative statement that kernel isolation, not capability trimming alone, is the answer for workloads that need elevated privileges. | https://kubernetes.io/docs/concepts/security/pod-security-standards/ | Kubernetes project | last modified 2026-10-16 | accessed 2026-11-05 | high | security

### Q3. Stronger isolation options

13. User namespaces map container root "to a non uid-0 user outside the container", reducing breakout impact; Docker says the feature is "available but not enabled by default". Rootless mode is an opt-in for the daemon itself. | https://docs.docker.com/engine/security/ | Docker Docs | undated | accessed 2026-11-05 | high | security

14. gVisor runs its own user-space network stack ("netstack") inside the Sentry, isolated from the host network stack; the container's addresses and routes are transferred into the sandbox. Switching to network passthrough (`--network=host` runtime arg) uses the host stack and "decreases the isolation to the host". | https://gvisor.dev/docs/user_guide/networking/ | The gVisor Authors (Google) | undated (page footer copyright 2026) | accessed 2026-11-05 | high | capability

15. gVisor offers `--network=none` (sandbox keeps only a netstack loopback) and an egress token-bucket rate limiter for non-loopback NICs (`--qdisc=tbf`, `--qdisc-tbf-rate`, `--qdisc-tbf-burst`, no defaults; ingress and loopback are not shaped). An external network proxy mode exists but is labelled experimental and L4-only. | https://gvisor.dev/docs/user_guide/networking/ | The gVisor Authors | undated (footer 2026) | accessed 2026-11-05 | high | capability

16. The gVisor networking user guide does not document raw sockets, creating veth/bridge devices inside the sandbox, or iptables/nftables support. Whether a routing-lab node works under gVisor is therefore unverified from primary docs (see Leads for search-snippet evidence that veth/bridge support exists but is still being fixed). | https://gvisor.dev/docs/user_guide/networking/ | The gVisor Authors | undated (footer 2026) | accessed 2026-11-05 | medium | capability

17. Firecracker describes itself as a VMM for "secure, multi-tenant, minimal-overhead execution of container and function workloads", claims "a < 125 ms startup time and a < 5 MiB memory footprint" per microVM (project's own figure, no methodology on the page), and defaults a microVM to 128 MB guest memory. It supports Intel, AMD and 64-bit ARM hosts, depends on `/dev/kvm`, exposes virtio-net among its few emulated devices, and is integrated with Kata Containers. | https://github.com/firecracker-microvm/firecracker/blob/main/FAQ.md | Firecracker project (AWS), GitHub | undated | accessed 2026-11-05 | medium (self-reported numbers) | performance-scale

18. The Firecracker FAQ does not address running nested inside a cloud VM. Since it needs `/dev/kvm`, a cheap VPS without nested virtualization cannot host it; that last step is an inference, not a quoted statement. | https://github.com/firecracker-microvm/firecracker/blob/main/FAQ.md | Firecracker project | undated | accessed 2026-11-05 | medium | capability

### Q4. Resource exhaustion

19. Docker: cgroups "are essential to fend off some denial-of-service attacks" and ensure "a single container cannot bring the system down by exhausting one of those resources"; they do not stop one container from accessing another's data or processes. | https://docs.docker.com/engine/security/ | Docker Docs | undated | accessed 2026-11-05 | high | security

20. Docker run limits: `-m/--memory` (minimum 6M), `--memory-swap` (total memory + swap), `--cpus` (fractional, 0.000 = no limit). By default the kernel kills processes in a container on OOM; `--oom-kill-disable` should only be used together with `-m`. | https://docs.docker.com/engine/containers/run/ | Docker Docs | undated | accessed 2026-11-05 | high | performance-scale

21. CAP_SYS_ADMIN can "override RLIMIT_NPROC resource limit" and "modify allow/deny rules for device control groups". Granting SYS_ADMIN to lab nodes therefore weakens rlimit-based fork-bomb protection (inference from the capability list; the interaction with the cgroup pids controller was not verified). | https://man7.org/linux/man-pages/man7/capabilities.7.html | Linux man-pages project, 6.19 | 2026-02-08 | accessed 2026-11-05 | medium | security

22. Because NET_ADMIN allows interface configuration and promiscuous mode and NET_RAW (on by default in Docker) allows RAW/PACKET sockets (findings 2, 5), a student node can generate arbitrary frames and build looped topologies inside whatever network it is attached to. No source read this run documents bridge-storm mitigations; the only network rate control evidenced is gVisor's egress TBF (finding 15). | derived from https://man7.org/linux/man-pages/man7/capabilities.7.html and https://docs.docker.com/engine/containers/run/ | man-pages project / Docker Docs | 2026-02-08 / undated | accessed 2026-11-05 | medium | security

### Q5. Egress and host/control-plane reachability

23. Docker bridge networks by default use masquerading "to give containers external network access" (`com.docker.network.bridge.enable_ip_masquerade` default `true`; gateway mode default `nat`). Lab nodes on an ordinary Docker bridge therefore reach the internet unless this is changed. | https://docs.docker.com/engine/network/drivers/bridge/ | Docker Docs | undated | accessed 2026-11-05 | high | security

24. Containers on the same user-defined bridge "effectively expose all ports to each other"; containers on different bridge networks can only communicate through published ports; inter-container connectivity can be switched off per bridge with `com.docker.network.bridge.enable_icc` (default `true`). The host has "unrestricted network access to containers in the network". | https://docs.docker.com/engine/network/drivers/bridge/ | Docker Docs | undated | accessed 2026-11-05 | high | security

25. Docker calls the default `bridge` network "not recommended for production use" because unrelated containers on it can communicate ("This can be a risk"); user-defined bridges scope traffic to attached containers. Docker installs host firewall rules automatically for bridge networks. Implication: one network per student lab, never the default bridge. | https://docs.docker.com/engine/network/drivers/bridge/ | Docker Docs | undated | accessed 2026-11-05 | high | security

26. Kubernetes Baseline forbids `hostNetwork`; the Privileged profile's own example of bypassing isolation is a Pod "that has access to the node's host network". Host networking for lab nodes is thus classed as an isolation bypass by Kubernetes. | https://kubernetes.io/docs/concepts/security/pod-security-standards/ | Kubernetes project | last modified 2026-10-16 | accessed 2026-11-05 | high | security

### Q6. WebSocket console exposure

27. OWASP: validate the `Origin` header on every WebSocket handshake against an explicit allowlist (no wildcard or substring matching) to prevent Cross-Site WebSocket Hijacking; add `SameSite=Lax/Strict` cookies and include CSRF tokens in the handshake where CSRF protection is used. The cheat sheet cites a 2023 Gitpod CSWSH incident. | https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html | OWASP Cheat Sheet Series | undated | accessed 2026-11-05 | high | security

28. OWASP: authenticate before serving any data, close on auth failure or timeout, limit unauthenticated connections, and "Check authorization for each action" rather than treating an open connection as blanket access. For a lab console this means checking on every attach that the session's user owns the target node. | https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html | OWASP Cheat Sheet Series | undated | accessed 2026-11-05 | high (the last sentence is my application of the rule) | security

29. OWASP: never use `ws://` in production (use `wss://`); avoid tokens in URL query strings because they leak into logs, prefer sending the token in the first message; do not log tokens, session IDs or full message contents. | https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html | OWASP Cheat Sheet Series | undated | accessed 2026-11-05 | high | security

30. OWASP: close WebSocket connections when the session expires, re-validate sessions periodically (30 minutes cited as common), close all of a user's sockets on logout (keep a session-to-connection map), and rotate tokens on long-lived connections. | https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html | OWASP Cheat Sheet Series | undated | accessed 2026-11-05 | high | security

31. OWASP: cap message size (64 KB or less suggested; set `maxPayload`), rate-limit messages (100/min suggested as a starting point; a terminal stream will need a different figure), limit connections per user, use idle timeouts and ping/pong, apply backpressure, treat all messages as untrusted input, and disable `permessage-deflate` unless needed. | https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html | OWASP Cheat Sheet Series | undated | accessed 2026-11-05 | high | security

### Bearing on the decision (inference, not sourced as a single statement)

32. The server-side option requires granting NET_ADMIN (finding 3) to code driven by untrusted users, which Docker's best practice (4) and both hardened Kubernetes profiles (7, 8) advise against unless the workload is isolated from the host kernel (12). The kernel-isolating options evidenced this run either need KVM (17, 18) or have undocumented support for lab networking features (16). Each also adds a per-student network, egress lockdown (23 to 25), cgroup limits (20) and an authenticated console (27 to 31) to the build. None of that attack surface exists when the simulation runs in the student's browser. This run found no source comparing the two approaches directly. | derived from findings above | n/a | n/a | accessed 2026-11-05 | medium | security

## Leads worth chasing

- NIST SP 800-190 (Application Container Security Guide). The PDF at https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-190.pdf could not be parsed by the fetch tool. It is the expected authoritative source for shared-kernel risk, privileged-mode misconfiguration, unbounded network access from containers, and grouping containers by threat posture. Nothing from it is cited above.
- gVisor veth/bridge support inside the sandbox. Search snippets only (pages not read, merge status unknown): google/gvisor issue #16069 "netstack: veth and bridge interfaces should be created down"; PRs #15008, #15559 (interface up/down), #16233 (bridge port hairpin/learning previously rejected with EOPNOTSUPP), #16230 and #15059 (bridge frame flooding/delivery fixes). These suggest netstack has veth and bridge devices but with active behavioral gaps versus Linux. A snippet from a gke-labs issue claims iptables rules in a pod's namespace are not applied by netstack. Verify against https://github.com/google/gvisor and the gVisor compatibility docs, including `--net-raw`.
- gVisor platforms page (https://gvisor.dev/docs/architecture_guide/platforms/) for whether gVisor runs without KVM on a plain VPS and at what overhead. Not read.
- Kata Containers host requirements. Search snippets only: SUSE RKE2 docs (https://documentation.suse.com/cloudnative/rke2/latest/de/add-ons/kata.html) say Kata needs hardware virtualization, `/dev/kvm`, and nested virtualization if the node is itself a VM; a Kata GCE guide snippet says many cloud providers do not support nested virtualization. No current official Kata requirements page was found or read.
- Docker `docker network create --internal` and Docker's packet-filtering/firewall docs (DOCKER-USER chain) for the documented way to remove external access and to block container-to-host traffic. The bridge driver page read this run does not mention `--internal`, and does not describe the `isolated`/`routed` gateway modes beyond linking elsewhere.
- Docker resource-constraints page and `docker container run` CLI reference for `--pids-limit` and `--ulimit`; the "Running containers" page as fetched did not cover `--pids-limit`.
- Docker rootless mode page for networking limitations and cgroup v2 requirements when the daemon is rootless.
- Linux kernel bridge documentation (docs.kernel.org/networking/bridge.html) for STP and storm control on a Linux bridge; `tc`/ebtables rate limiting on veth host ends.
- Firecracker `docs/prod-host-setup.md`, jailer docs and kernel support policy for multi-tenant hardening and host kernel versions.
- Existing lab tools' own security notes (containerlab, GNS3, Kathara) on required privileges and whether they are intended for untrusted users.

## Looked for but could not find

- Any authoritative guidance specific to giving untrusted users a router CLI (vtysh, VyOS shell) in a container, or on escape classes from such shells. Docker's security page has no such section; NIST SP 800-190 was unreadable. Not verified.
- An explicit Docker statement that containers share the host kernel. The security page implies it through its namespace/cgroup/kernel-vulnerability discussion but, as fetched, does not say it in one sentence.
- Primary-doc confirmation that gVisor supports raw sockets, veth/bridge creation, or routing daemons inside the sandbox. The networking guide is silent; only unverified GitHub snippets were seen.
- What Kata Containers itself provides or requires, from Kata's own documentation. Only third-party snippets.
- Whether Firecracker or Kata can run on low-cost VPS plans (nested virtualization availability by provider). Not covered in the Firecracker FAQ; no provider documentation read.
- Overhead figures for gVisor, Kata or rootless containers. Only Firecracker's self-reported footprint was found.
- Documented mitigations for broadcast storms or loops on a Linux bridge, and for `--pids-limit`/fork bombs. No source read covers them.
- Docker's `--internal` network behavior and container-to-host firewalling guidance. Not on the page read.
- Publication dates for the Docker, gVisor, OWASP and Firecracker pages; all are undated on the page. Only Kubernetes (2026-10-16) and man-pages (6.19, 2026-02-08) show dates.
- Any source directly comparing in-browser simulation with server-side emulation on security or cost.

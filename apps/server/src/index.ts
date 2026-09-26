import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { Layer } from "effect";

import { ServerLive } from "./layers/index.js";

Layer.launch(ServerLive).pipe(NodeRuntime.runMain);

import { updateArtifactSection } from "../store/artifacts.js";

export async function updateArtifact(
  projectRoot: string,
  artifact: "spec" | "design",
  section: string,
  content: string
): Promise<{ updated: boolean; message: string }> {
  return updateArtifactSection(projectRoot, artifact, section, content);
}

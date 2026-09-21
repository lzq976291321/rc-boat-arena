// Dispose resources owned by this group only. Instances sharing a prototype must
// be disposed together, not one at a time. Shader uniforms may contain textures.
export function disposeObjects(roots, { textures: releaseTextures = true, extraTextures = [] } = {}) {
  const geometries = new Set(), materials = new Set(), textures = new Set(extraTextures), images = new Set(), skeletons = new Set(), instances = new Set();
  for (const root of Array.isArray(roots) ? roots : [roots]) root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.isInstancedMesh) instances.add(object);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) {
        for (const value of Array.isArray(uniform.value) ? uniform.value : [uniform.value]) if (value?.isTexture) textures.add(value);
      }
    }
  });
  for (const instance of instances) instance.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
  if (releaseTextures) for (const texture of textures) {
    texture.dispose();
    for (const image of Array.isArray(texture.source?.data) ? texture.source.data : [texture.source?.data]) if (image?.close) images.add(image);
  }
  for (const image of images) image.close();
}

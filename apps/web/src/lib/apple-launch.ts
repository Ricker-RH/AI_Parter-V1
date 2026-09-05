import sizes from './apple-launch-sizes.json'

export const appleStartupImages = sizes.flatMap(([width,height,scale]) =>
  (['portrait','landscape'] as const).flatMap(orientation =>
    (['light','dark'] as const).map(theme => ({
      url:`/pwa/launch-${width}-${height}-${scale}-${orientation}-${theme}-v2.png`,
      media:`(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: ${orientation}) and (prefers-color-scheme: ${theme})`,
    })),
  ),
)

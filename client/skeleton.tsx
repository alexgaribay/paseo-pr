import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useRef } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";

export function useSkeletonPulse() {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.95, duration: 750, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: false }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity]);
  return opacity;
}

export function SkeletonBone(props: {
  theme: PluginTheme;
  pulse: Animated.Value;
  width?: number;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: props.width,
          height: props.height,
          borderRadius: props.radius ?? 6,
          backgroundColor: props.theme.colors.surface2,
          opacity: props.pulse,
        },
        props.style,
      ]}
    />
  );
}

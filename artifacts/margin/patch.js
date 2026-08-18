const fs = require('fs');
let code = fs.readFileSync('components/InboxOverlay.tsx', 'utf8');

code = code.replace(
  'import React, { useCallback, useEffect, useState } from "react";',
  'import React, { useCallback, useEffect, useState } from "react";\nimport Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from "react-native-reanimated";'
);

code = code.replace(
  'export function InboxOverlay({ visible, onClose, onNotificationsRead }: Props) {',
  `const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function InboxOverlay({ visible, onClose, onNotificationsRead }: Props) {
  const [renderModal, setRenderModal] = useState(visible);
  const translateX = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setRenderModal(true);
      translateX.value = withSpring(0, { damping: 24, stiffness: 220, mass: 0.8 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateX.value = withSpring(400, { damping: 24, stiffness: 220, mass: 0.8 });
      backdropOpacity.value = withTiming(0, { duration: 250 });
      const t = setTimeout(() => setRenderModal(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);`
);

code = code.replace(
  '<Modal\n      visible={visible}\n      transparent\n      animationType="fade"',
  '<Modal\n      visible={renderModal}\n      transparent\n      animationType="none"'
);

code = code.replace(
  '<Pressable style={styles.backdrop} onPress={onClose} />',
  '<AnimatedPressable style={[styles.backdrop, { opacity: backdropOpacity }]} onPress={onClose} />'
);

code = code.replace(
  '<View\n        style={[\n          styles.panel,\n          { backgroundColor: colors.card, paddingTop: insets.top + 16 },\n        ]}',
  '<Animated.View\n        style={[\n          styles.panel,\n          { backgroundColor: colors.card, paddingTop: insets.top + 16 },\n          { transform: [{ translateX }] }\n        ]}'
);

code = code.replace(
  '</View>\n    </Modal>',
  '</Animated.View>\n    </Modal>'
);

fs.writeFileSync('components/InboxOverlay.tsx', code);

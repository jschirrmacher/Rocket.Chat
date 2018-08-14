#!/bin/sh

set -x
set +e
METEOR_SYMLINK_TARGET=$(readlink ~/.meteor/meteor)
METEOR_TOOL_DIRECTORY=$(dirname "$METEOR_SYMLINK_TARGET")
set -e
LAUNCHER=$HOME/.meteor/$METEOR_TOOL_DIRECTORY/scripts/admin/launch-meteor
if [ -e $LAUNCHER ]
then
echo "Cached Meteor bin found, restoring it"
sudo cp "$LAUNCHER" "/usr/local/bin/meteor"
else
echo "No cached Meteor bin found."
fi

# only install meteor if bin isn't found
command -v meteor >/dev/null 2>&1 || curl https://install.meteor.com | sed s/--progress-bar/-sL/g | /bin/sh
